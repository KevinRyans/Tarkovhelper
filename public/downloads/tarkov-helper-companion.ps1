param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$CompanionToken,

  [string]$LogsRoot = "",

  [int]$PollSeconds = 3,

  [int]$BackfillLogLimit = 16,

  [int]$BackfillTailLines = 15000,

  [int]$BackfillFlushEveryLogs = 25,

  [int]$LiveLogLimit = 12,

  [bool]$PrioritizePushNotificationLogs = $true,

  [switch]$FullBackfill,

  [switch]$BackfillOnly,

  [switch]$NoBackfill
)

$ErrorActionPreference = "Stop"

function Resolve-LogsRoot {
  param([string]$UserPath)

  if ($UserPath -and (Test-Path -LiteralPath $UserPath)) {
    if (Test-Path -LiteralPath (Join-Path $UserPath "Logs")) {
      return (Join-Path $UserPath "Logs")
    }

    return $UserPath
  }

  $candidates = @(
    "$env:USERPROFILE\Documents\Escape from Tarkov\Logs",
    "$env:USERPROFILE\Documents\EscapeFromTarkov\Logs",
    "$env:APPDATA\Battlestate Games\Escape from Tarkov\Logs",
    "$env:APPDATA\Battlestate Games\EscapeFromTarkov\Logs",
    "$env:LOCALAPPDATA\Battlestate Games\Escape from Tarkov\Logs",
    "$env:LOCALAPPDATA\Battlestate Games\EscapeFromTarkov\Logs",
    "C:\Battlestate Games\EFT (live)\Logs",
    "C:\Battlestate Games\EFT\Logs"
  )

  $drives = Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root
  foreach ($driveRoot in $drives) {
    $drive = $driveRoot.TrimEnd("\")
    $candidates += "$drive\Battlestate Games\EFT (live)\Logs"
    $candidates += "$drive\Battlestate Games\EFT\Logs"
    $candidates += "$drive\Games\Battlestate Games\EFT (live)\Logs"
    $candidates += "$drive\Games\Battlestate Games\EFT\Logs"
  }

  $launcherSettingsCandidates = @(
    "$env:APPDATA\Battlestate Games\BsgLauncher\settings",
    "$env:APPDATA\Battlestate Games\BsgLauncher\settings.json",
    "$env:LOCALAPPDATA\Battlestate Games\BsgLauncher\settings",
    "$env:LOCALAPPDATA\Battlestate Games\BsgLauncher\settings.json"
  )

  foreach ($settingsFile in $launcherSettingsCandidates) {
    if (-not (Test-Path -LiteralPath $settingsFile)) {
      continue
    }

    try {
      $raw = Get-Content -LiteralPath $settingsFile -Raw
      if (-not $raw) {
        continue
      }

      # Launcher settings usually store escaped paths (C:\\Battlestate Games\\EFT (live))
      $normalized = $raw -replace "\\\\", "\"
      $pathMatches = [System.Text.RegularExpressions.Regex]::Matches($normalized, '[A-Za-z]:\\[^"\r\n]+')

      foreach ($m in $pathMatches) {
        $rootPath = $m.Value.Trim()
        if (-not $rootPath) {
          continue
        }

        $candidateLogs = Join-Path $rootPath "Logs"
        if (Test-Path -LiteralPath $candidateLogs) {
          return $candidateLogs
        }
      }
    } catch {
      Write-Warning ("Could not parse launcher settings from {0}: {1}" -f $settingsFile, $_.Exception.Message)
    }
  }

  foreach ($path in ($candidates | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $path) {
      return $path
    }
  }

  return $null
}

function Normalize-Status {
  param([string]$Raw)

  if (-not $Raw) {
    return $null
  }

  $value = $Raw.ToLowerInvariant()

  if ($value -match "completed|complete|success|succeeded|ready to hand in|available for finish|finished|turned in|hand in|handin") {
    return "DONE"
  }

  if ($value -match "started|in progress|active|running|available for start|available|new") {
    return "IN_PROGRESS"
  }

  if ($value -match "not started|locked|unavailable") {
    return "NOT_STARTED"
  }

  return $null
}

function Parse-EventsFromLines {
  param([string[]]$Lines)

  $eventsByKey = @{}
  $statusPattern = "(?<status>completed|complete|success|succeeded|ready to hand in|available for finish|finished|turned in|started|in progress|active|running|available for start|available|not started|locked|unavailable)"
  $idPatterns = @(
    "(?i)(?:quest|task)(?:\s*id|_id)?\s*[:=]\s*""?(?<id>[a-f0-9]{24})""?[^\r\n]{0,120}$statusPattern",
    "(?i)$statusPattern[^\r\n]{0,120}(?:quest|task)(?:\s*id|_id)?\s*[:=]\s*""?(?<id>[a-f0-9]{24})""?",
    "(?i)""(?:questId|taskId|qid)""\s*:\s*""(?<id>[a-f0-9]{24})""[^\r\n]{0,140}""(?:status|state)""\s*:\s*""?(?<status>[A-Za-z _-]{3,48})""?",
    "(?i)""(?:status|state)""\s*:\s*""?(?<status>[A-Za-z _-]{3,48})""?[^\r\n]{0,140}""(?:questId|taskId|qid)""\s*:\s*""(?<id>[a-f0-9]{24})"""
  )
  $namePatterns = @(
    "(?i)(?:quest|task)\s*[:\-]?\s*(?<name>[A-Za-z0-9][A-Za-z0-9 \-\(\)\[\]\.\?\,\'\/]{2,160})[^\r\n]{0,80}$statusPattern",
    "(?i)$statusPattern[^\r\n]{0,50}(?:quest|task)\s*[:\-]?\s*(?<name>[A-Za-z0-9][A-Za-z0-9 \-\(\)\[\]\.\?\,\'\/]{2,160})"
  )

  foreach ($line in $Lines) {
    if (-not $line) {
      continue
    }

    # EFT push-notifications often contain quest updates in templateId:
    # "templateId": "<questId> successMessageText" (quest done)
    # "templateId": "<questId> description" (quest started/info)
    $templateMatch = [System.Text.RegularExpressions.Regex]::Match(
      $line,
      '(?i)"templateId"\s*:\s*"(?<id>[a-f0-9]{24})\s+(?<kind>successMessageText|description)\b'
    )
    if ($templateMatch.Success) {
      $taskId = $templateMatch.Groups["id"].Value.Trim().ToLowerInvariant()
      $kind = $templateMatch.Groups["kind"].Value.Trim().ToLowerInvariant()
      $status = $null

      if ($kind -eq "successmessagetext") {
        $status = "DONE"
      } elseif ($kind -eq "description") {
        $status = "IN_PROGRESS"
      }

      if ($taskId -and $status) {
        $key = "$status::$taskId"
        $eventsByKey[$key] = @{
          taskId = $taskId
          status = $status
        }
        continue
      }
    }

    $capturedById = $false
    foreach ($pattern in $idPatterns) {
      $match = [System.Text.RegularExpressions.Regex]::Match($line, $pattern)
      if (-not $match.Success) {
        continue
      }

      $taskId = $match.Groups["id"].Value.Trim().ToLowerInvariant()
      $status = Normalize-Status $match.Groups["status"].Value
      if (-not $taskId -or -not $status) {
        continue
      }

      $key = "$status::$taskId"
      $eventsByKey[$key] = @{
        taskId = $taskId
        status = $status
      }

      $capturedById = $true
      break
    }

    if ($capturedById) {
      continue
    }

    foreach ($pattern in $namePatterns) {
      $match = [System.Text.RegularExpressions.Regex]::Match($line, $pattern)
      if (-not $match.Success) {
        continue
      }

      $taskName = $match.Groups["name"].Value.Trim()
      $status = Normalize-Status $match.Groups["status"].Value
      if (-not $taskName -or -not $status) {
        continue
      }

      if ($taskName.Length -gt 160) {
        $taskName = $taskName.Substring(0, 160).Trim()
      }

      $key = "$status::$taskName"
      $eventsByKey[$key] = @{
        taskName = $taskName
        status   = $status
      }

      break
    }
  }

  return @($eventsByKey.Values)
}

function Merge-Events {
  param(
    [hashtable]$Buffer,
    [object[]]$Events
  )

  if (-not $Events -or $Events.Count -eq 0) {
    return
  }

  foreach ($event in $Events) {
    if (-not $event) {
      continue
    }

    $taskId = $null
    $taskName = $null
    $status = $null

    if ($event -is [System.Collections.IDictionary]) {
      if ($event.Contains("taskId")) {
        $taskId = [string]$event["taskId"]
      }
      if ($event.Contains("taskName")) {
        $taskName = [string]$event["taskName"]
      }
      if ($event.Contains("status")) {
        $status = [string]$event["status"]
      }
    } else {
      if (($event.PSObject.Properties.Name -contains "taskId")) {
        $taskId = [string]$event.taskId
      }
      if (($event.PSObject.Properties.Name -contains "taskName")) {
        $taskName = [string]$event.taskName
      }
      if (($event.PSObject.Properties.Name -contains "status")) {
        $status = [string]$event.status
      }
    }

    $key = $null
    if ($taskId -and $status) {
      $key = "$status::$taskId"
    } elseif ($taskName -and $status) {
      $key = "$status::$taskName"
    }

    if ($key) {
      if ($event -is [System.Collections.IDictionary]) {
        $Buffer[$key] = $event
      } else {
        $Buffer[$key] = @{
          taskId = $taskId
          taskName = $taskName
          status = $status
        }
      }
    }
  }
}

function Send-Events {
  param(
    [string]$BaseUrl,
    [string]$Token,
    [object[]]$Events,
    [string]$Source
  )

  if (-not $Events -or $Events.Count -eq 0) {
    return
  }

  $payload = @{
    source = $Source
    events = $Events
  } | ConvertTo-Json -Depth 6

  $headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
  }

  $uri = ($BaseUrl.TrimEnd("/") + "/api/companion/ingest")

  try {
    $response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $payload
    Write-Host ("[{0}] Sent {1} events (taskUpdates={2}, skipped={3})" -f (Get-Date -Format "HH:mm:ss"), $Events.Count, $response.taskUpdates, ($response.skippedUnknownTask + $response.skippedUnknownStatus))

    if (($response.skippedUnknownTask -gt 0) -and ($response.PSObject.Properties.Name -contains "unknownTaskSamples") -and $response.unknownTaskSamples) {
      Write-Warning ("Unknown tasks (sample): {0}" -f (($response.unknownTaskSamples | Select-Object -First 6) -join " | "))
    }

    if (($response.skippedUnknownStatus -gt 0) -and ($response.PSObject.Properties.Name -contains "unknownStatusSamples") -and $response.unknownStatusSamples) {
      Write-Warning ("Unknown statuses (sample): {0}" -f (($response.unknownStatusSamples | Select-Object -First 6) -join " | "))
    }
  } catch {
    Write-Warning ("Failed to send events: {0}" -f $_.Exception.Message)
  }
}

function Read-NewLines {
  param(
    [string]$FilePath,
    [hashtable]$Offsets
  )

  $offset = 0
  if ($Offsets.ContainsKey($FilePath)) {
    $offset = [int64]$Offsets[$FilePath]
  }

  $stream = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)

  try {
    if ($offset -gt $stream.Length) {
      $offset = 0
    }

    $stream.Seek($offset, [System.IO.SeekOrigin]::Begin) | Out-Null
    $reader = New-Object System.IO.StreamReader($stream)
    $lines = New-Object System.Collections.Generic.List[string]

    while (-not $reader.EndOfStream) {
      $lines.Add($reader.ReadLine())
    }

    $Offsets[$FilePath] = $stream.Position
    $reader.Dispose()
    return $lines.ToArray()
  } finally {
    $stream.Dispose()
  }
}

function Get-OrderedLogs {
  param(
    [string]$RootPath,
    [bool]$PrioritizePushLogs
  )

  $allLogs = Get-ChildItem -LiteralPath $RootPath -Recurse -File -Filter *.log | Sort-Object LastWriteTime -Descending
  if (-not $PrioritizePushLogs) {
    return @($allLogs)
  }

  $pushLogs = @($allLogs | Where-Object { $_.Name -like "*push-notifications*.log" })
  $otherLogs = @($allLogs | Where-Object { $_.Name -notlike "*push-notifications*.log" })
  return @($pushLogs + $otherLogs)
}

$resolvedLogsRoot = Resolve-LogsRoot -UserPath $LogsRoot
if (-not $resolvedLogsRoot) {
  throw "Could not find EFT log directory. Pass -LogsRoot explicitly."
}

Write-Host ("Using logs: {0}" -f $resolvedLogsRoot)
Write-Host ("Ingest endpoint: {0}/api/companion/ingest" -f $ApiBaseUrl.TrimEnd("/"))

$offsets = @{}

if (-not $NoBackfill) {
  $allLogs = Get-OrderedLogs -RootPath $resolvedLogsRoot -PrioritizePushLogs $PrioritizePushNotificationLogs
  $pushLogsAll = @($allLogs | Where-Object { $_.Name -like "*push-notifications*.log" })

  if (-not $FullBackfill -and $PrioritizePushNotificationLogs -and $pushLogsAll.Count -gt 0) {
    # Quest sync is primarily present in push-notification logs. Reading these first avoids noise and speeds up backfill.
    $recentLogs = $pushLogsAll | Select-Object -First $BackfillLogLimit
  } elseif ($FullBackfill) {
    $recentLogs = $allLogs
  } else {
    $recentLogs = $allLogs | Select-Object -First $BackfillLogLimit
  }

  $selectedPushLogs = @($recentLogs | Where-Object { $_.Name -like "*push-notifications*.log" }).Count
  Write-Host ("Backfill scanning {0} log files (pushLogs={1}, full={2}, tailLines={3})" -f @($recentLogs).Count, $selectedPushLogs, [bool]$FullBackfill, $BackfillTailLines)
  $bufferedEvents = @{}
  $totalLogs = @($recentLogs).Count
  $processedLogs = 0
  $startedAt = Get-Date
  $matchedEventsTotal = 0
  $sentUniqueEventsTotal = 0
  $sentBatches = 0

  if ($totalLogs -eq 0) {
    Write-Warning "No .log files found under selected LogsRoot."
  }

  foreach ($log in $recentLogs) {
    try {
      $isPushLog = $log.Name -like "*push-notifications*.log"
      if ($FullBackfill -or $isPushLog) {
        $lines = Get-Content -LiteralPath $log.FullName
      } else {
        $lines = Get-Content -LiteralPath $log.FullName -Tail $BackfillTailLines
      }

      $events = Parse-EventsFromLines -Lines $lines
      $matchedEventsTotal += $events.Count
      Merge-Events -Buffer $bufferedEvents -Events $events
      $offsets[$log.FullName] = (Get-Item -LiteralPath $log.FullName).Length
    } catch {
      Write-Warning ("Backfill skip for {0}: {1}" -f $log.FullName, $_.Exception.Message)
    }

    $processedLogs += 1
    $flushEvery = [Math]::Max($BackfillFlushEveryLogs, 1)
    if (($processedLogs % $flushEvery -eq 0) -or ($processedLogs -eq $totalLogs)) {
      $toSend = @($bufferedEvents.Values)
      if ($toSend.Count -gt 0) {
        $sentBatches += 1
        $sentUniqueEventsTotal += $toSend.Count
        Send-Events -BaseUrl $ApiBaseUrl -Token $CompanionToken -Events $toSend -Source "powershell-backfill"
        $bufferedEvents.Clear()
      }

      if ($totalLogs -gt 0) {
        $elapsed = (Get-Date) - $startedAt
        $percent = [Math]::Round(($processedLogs / [double]$totalLogs) * 100, 1)
        Write-Host ("Backfill progress: {0}/{1} logs ({2}%) elapsed {3:mm\:ss}" -f $processedLogs, $totalLogs, $percent, $elapsed)
      }
    }
  }

  if ($sentBatches -eq 0) {
    Write-Warning ("Backfill found 0 syncable quest events in scanned logs (matched={0}). Try -FullBackfill or increase -BackfillLogLimit." -f $matchedEventsTotal)
  } else {
    Write-Host ("Backfill summary: matched={0}, sentUnique={1}, batches={2}" -f $matchedEventsTotal, $sentUniqueEventsTotal, $sentBatches)
  }
}

if ($BackfillOnly) {
  Write-Host "Backfill completed. Exiting because -BackfillOnly was set."
  return
}

while ($true) {
  $recentLogs = Get-OrderedLogs -RootPath $resolvedLogsRoot -PrioritizePushLogs $PrioritizePushNotificationLogs | Select-Object -First $LiveLogLimit
  $allNewLines = New-Object System.Collections.Generic.List[string]

  foreach ($log in $recentLogs) {
    try {
      $newLines = Read-NewLines -FilePath $log.FullName -Offsets $offsets
      foreach ($line in $newLines) {
        $allNewLines.Add($line)
      }
    } catch {
      Write-Warning ("Live scan skip for {0}: {1}" -f $log.FullName, $_.Exception.Message)
    }
  }

  $events = Parse-EventsFromLines -Lines $allNewLines.ToArray()
  Send-Events -BaseUrl $ApiBaseUrl -Token $CompanionToken -Events $events -Source "powershell-live"

  Start-Sleep -Seconds $PollSeconds
}
