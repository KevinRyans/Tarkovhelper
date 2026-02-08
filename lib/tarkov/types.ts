export type TaskRequirement = {
  task: {
    id: string;
    name: string;
  };
  status: string[];
};

export type TraderRequirement = {
  id: string;
  requirementType: string;
  compareMethod: string;
  value: number;
  trader: {
    id: string;
    name: string;
  };
};

export type TaskObjective = {
  __typename: string;
  id: string;
  type?: string;
  description: string;
  optional: boolean;
  maps?: Array<{ id: string; name: string }>;
  count?: number;
  foundInRaid?: boolean;
  item?: TarkovItemLite | null;
  items?: TarkovItemLite[];
  markerItem?: TarkovItemLite | null;
  questItem?: TarkovItemLite | null;
  targetNames?: string[];
  usingWeapon?: TarkovItemLite[] | null;
  usingWeaponMods?: TarkovItemLite[][];
  wearing?: TarkovItemLite[][];
  notWearing?: TarkovItemLite[] | null;
  requiredKeys?: TarkovItemLite[][];
  zoneNames?: string[];
  playerLevel?: number;
  level?: number;
  trader?: { id: string; name: string } | null;
  status?: string[];
  task?: { id: string; name: string } | null;
};

export type TaskRewards = {
  traderStanding: Array<{
    trader: { id: string; name: string };
    standing: number;
  }>;
  items: Array<{
    count: number;
    item: TarkovItemLite;
  }>;
  offerUnlock: Array<{
    id: string;
    trader: { id: string; name: string };
    level: number;
    item: TarkovItemLite;
  }>;
  traderUnlock: Array<{ id: string; name: string }>;
};

export type TarkovTask = {
  id: string;
  name: string;
  normalizedName: string;
  wikiLink: string | null;
  taskImageLink: string | null;
  trader: { id: string; name: string };
  map: { id: string; name: string } | null;
  minPlayerLevel: number | null;
  kappaRequired: boolean;
  lightkeeperRequired: boolean;
  taskRequirements: TaskRequirement[];
  traderRequirements: TraderRequirement[];
  objectives: TaskObjective[];
  startRewards: TaskRewards | null;
  finishRewards: TaskRewards | null;
};

export type TarkovItemLite = {
  id: string;
  name: string;
  normalizedName?: string;
  shortName?: string;
  iconLink?: string | null;
  avg24hPrice?: number | null;
  lastLowPrice?: number | null;
  types?: string[];
  weight?: number | null;
};

export type TarkovItemOffer = {
  vendor: {
    name: string;
  };
  priceRUB: number;
};

export type ItemSlot = {
  id: string;
  name: string;
  required: boolean;
  filters: {
    allowedItems: TarkovWeaponMod[];
    allowedCategories: Array<{ id: string; name: string }>;
  };
};

export type WeaponProperties = {
  __typename: "ItemPropertiesWeapon";
  recoilVertical: number;
  recoilHorizontal: number;
  ergonomics: number;
  defaultWeight?: number | null;
  slots: ItemSlot[];
};

export type WeaponModProperties = {
  __typename:
    | "ItemPropertiesWeaponMod"
    | "ItemPropertiesBarrel"
    | "ItemPropertiesScope"
    | "ItemPropertiesMagazine"
    | "ItemPropertiesPreset";
  ergonomics?: number | null;
  recoilModifier?: number | null;
  accuracyModifier?: number | null;
};

export type TarkovWeaponMod = TarkovItemLite & {
  buyFor?: TarkovItemOffer[];
  properties?: WeaponModProperties | null;
};

export type TarkovWeapon = TarkovItemLite & {
  buyFor: TarkovItemOffer[];
  properties: WeaponProperties;
};

export type TraderOffer = {
  id: string;
  minTraderLevel: number;
  priceRUB: number;
  taskUnlock: {
    id: string;
    name: string;
  } | null;
  item: {
    id: string;
    name: string;
  };
};

export type TraderCatalog = {
  id: string;
  name: string;
  levels: Array<{
    id: string;
    level: number;
    cashOffers: TraderOffer[];
  }>;
};

export type FleaItem = TarkovItemLite & {
  avg24hPrice: number | null;
  lastLowPrice: number | null;
  low24hPrice: number | null;
  high24hPrice: number | null;
  changeLast48h: number | null;
  changeLast48hPercent: number | null;
  historicalPrices: Array<{
    price: number;
    timestamp: string;
  }>;
};
