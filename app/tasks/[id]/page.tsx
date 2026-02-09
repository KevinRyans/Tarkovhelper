import { TaskProgressStatus } from "@prisma/client";
import { notFound } from "next/navigation";

import { TaskDetail } from "@/components/tasks/task-detail";
import { getServerAuthSession } from "@/lib/auth/session";
import { getNeededItemsForTask } from "@/lib/tasks/logic";
import { getUserProgressMaps } from "@/lib/tasks/progress";
import { getNextTasksByTaskId, getTaskById } from "@/lib/tarkov/service";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTaskById(id);

  if (!task) {
    notFound();
  }

  const session = await getServerAuthSession();
  const progress = session?.user?.id
    ? await getUserProgressMaps(session.user.id)
    : {
        statusByTaskId: {} as Record<string, TaskProgressStatus>,
        objectiveDoneByTaskId: {},
      };

  const nextTasks = await getNextTasksByTaskId(task.id);

  return (
    <div className="space-y-4">
      <TaskDetail
        task={task}
        nextTasks={nextTasks}
        status={progress.statusByTaskId[task.id] ?? TaskProgressStatus.NOT_STARTED}
        objectiveDoneMap={progress.objectiveDoneByTaskId[task.id] ?? {}}
        neededItems={getNeededItemsForTask(task)}
        canEdit={Boolean(session?.user?.id)}
      />
    </div>
  );
}
