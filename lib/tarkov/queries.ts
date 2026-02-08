export const TASKS_PAGE_QUERY = `
  query TasksPage($limit: Int!, $offset: Int!) {
    tasks(limit: $limit, offset: $offset) {
      id
      name
      normalizedName
      wikiLink
      taskImageLink
      minPlayerLevel
      kappaRequired
      lightkeeperRequired
      trader {
        id
        name
      }
      map {
        id
        name
      }
      taskRequirements {
        status
        task {
          id
          name
        }
      }
      traderRequirements {
        id
        requirementType
        compareMethod
        value
        trader {
          id
          name
        }
      }
      objectives {
        __typename
        id
        type
        description
        optional
        maps {
          id
          name
        }
        ... on TaskObjectivePlayerLevel {
          playerLevel
        }
        ... on TaskObjectiveTraderLevel {
          level
          trader {
            id
            name
          }
        }
        ... on TaskObjectiveTraderStanding {
          trader {
            id
            name
          }
        }
        ... on TaskObjectiveTaskStatus {
          status
          task {
            id
            name
          }
        }
        ... on TaskObjectiveItem {
          count
          foundInRaid
          items {
            id
            name
            iconLink
          }
        }
        ... on TaskObjectiveBuildItem {
          item {
            id
            name
            normalizedName
            shortName
            iconLink
          }
        }
        ... on TaskObjectiveQuestItem {
          count
          questItem {
            id
            name
            normalizedName
            shortName
            iconLink
          }
        }
        ... on TaskObjectiveMark {
          markerItem {
            id
            name
            normalizedName
            shortName
            iconLink
          }
        }
        ... on TaskObjectiveShoot {
          count
          targetNames
          zoneNames
          usingWeapon {
            id
            name
            normalizedName
            shortName
            iconLink
          }
          usingWeaponMods {
            id
            name
            normalizedName
            shortName
            iconLink
          }
          wearing {
            id
            name
            normalizedName
            shortName
            iconLink
          }
          notWearing {
            id
            name
            normalizedName
            shortName
            iconLink
          }
          requiredKeys {
            id
            name
            normalizedName
            shortName
            iconLink
          }
        }
      }
      startRewards {
        traderStanding {
          standing
          trader {
            id
            name
          }
        }
        items {
          count
          item {
            id
            name
            normalizedName
            shortName
            iconLink
          }
        }
        offerUnlock {
          id
          level
          trader {
            id
            name
          }
          item {
            id
            name
            normalizedName
            shortName
            iconLink
          }
        }
        traderUnlock {
          id
          name
        }
      }
      finishRewards {
        traderStanding {
          standing
          trader {
            id
            name
          }
        }
        items {
          count
          item {
            id
            name
            normalizedName
            shortName
            iconLink
          }
        }
        offerUnlock {
          id
          level
          trader {
            id
            name
          }
          item {
            id
            name
            normalizedName
            shortName
            iconLink
          }
        }
        traderUnlock {
          id
          name
        }
      }
    }
  }
`;

export const WEAPONS_PAGE_QUERY = `
  query WeaponsPage($limit: Int!, $offset: Int!) {
    items(type: gun, limit: $limit, offset: $offset) {
      id
      name
      normalizedName
      shortName
      iconLink
      types
      avg24hPrice
      lastLowPrice
      weight
      buyFor {
        priceRUB
        vendor {
          name
        }
      }
      properties {
        __typename
        ... on ItemPropertiesWeapon {
          recoilVertical
          recoilHorizontal
          ergonomics
        }
      }
    }
  }
`;

export const WEAPON_DETAIL_QUERY = `
  query WeaponDetail($id: ID!) {
    item(id: $id) {
      id
      name
      normalizedName
      shortName
      iconLink
      types
      avg24hPrice
      lastLowPrice
      weight
      buyFor {
        priceRUB
        vendor {
          name
        }
      }
      properties {
        __typename
        ... on ItemPropertiesWeapon {
          recoilVertical
          recoilHorizontal
          ergonomics
          defaultWeight
          slots {
            id
            name
            required
            filters {
              allowedCategories {
                id
                name
              }
              allowedItems {
                id
                name
                normalizedName
                shortName
                iconLink
                avg24hPrice
                lastLowPrice
                weight
                buyFor {
                  priceRUB
                  vendor {
                    name
                  }
                }
                properties {
                  __typename
                  ... on ItemPropertiesWeaponMod {
                    ergonomics
                    recoilModifier
                    accuracyModifier
                  }
                  ... on ItemPropertiesBarrel {
                    ergonomics
                    recoilModifier
                  }
                  ... on ItemPropertiesScope {
                    ergonomics
                    recoilModifier
                  }
                  ... on ItemPropertiesMagazine {
                    ergonomics
                    recoilModifier
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const TRADERS_PAGE_QUERY = `
  query TradersPage($limit: Int!, $offset: Int!) {
    traders(limit: $limit, offset: $offset) {
      id
      name
      levels {
        id
        level
        cashOffers {
          id
          minTraderLevel
          priceRUB
          taskUnlock {
            id
            name
          }
          item {
            id
            name
          }
        }
      }
    }
  }
`;

export const FLEA_ITEMS_QUERY = `
  query FleaItems($name: String!, $limit: Int!, $offset: Int!) {
    items(name: $name, limit: $limit, offset: $offset) {
      id
      name
      normalizedName
      shortName
      iconLink
      types
      avg24hPrice
      lastLowPrice
      low24hPrice
      high24hPrice
      changeLast48h
      changeLast48hPercent
      historicalPrices {
        price
        timestamp
      }
    }
  }
`;

export const ITEM_ICON_QUERY = `
  query ItemIcon($id: ID!) {
    item(id: $id) {
      id
      normalizedName
      iconLink
      name
    }
  }
`;
