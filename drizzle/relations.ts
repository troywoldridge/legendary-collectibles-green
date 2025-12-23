import { relations } from "drizzle-orm/relations";
import { marketItems, marketPricesCurrent, scryfallSets, scryfallCardsRaw, userCollectionItems, userCollectionItemValuations, userWishlistItems, ygoCards, ygoCardPrices, ygoCardPricesHistory, ygoCardBanlist, scryfallCatalogs, scryfallCatalogValues, ygoCardImages, ygoCardSets, marketItemExternalIds, marketPriceDaily, marketPriceSnapshots } from "./schema";

export const marketPricesCurrentRelations = relations(marketPricesCurrent, ({one}) => ({
	marketItem: one(marketItems, {
		fields: [marketPricesCurrent.marketItemId],
		references: [marketItems.id]
	}),
}));

export const marketItemsRelations = relations(marketItems, ({many}) => ({
	marketPricesCurrents: many(marketPricesCurrent),
	userWishlistItems: many(userWishlistItems),
	marketItemExternalIds: many(marketItemExternalIds),
	marketPriceDailies: many(marketPriceDaily),
	marketPriceSnapshots: many(marketPriceSnapshots),
}));

export const scryfallCardsRawRelations = relations(scryfallCardsRaw, ({one}) => ({
	scryfallSet: one(scryfallSets, {
		fields: [scryfallCardsRaw.setId],
		references: [scryfallSets.id]
	}),
}));

export const scryfallSetsRelations = relations(scryfallSets, ({many}) => ({
	scryfallCardsRaws: many(scryfallCardsRaw),
}));

export const userCollectionItemValuationsRelations = relations(userCollectionItemValuations, ({one}) => ({
	userCollectionItem: one(userCollectionItems, {
		fields: [userCollectionItemValuations.itemId],
		references: [userCollectionItems.id]
	}),
}));

export const userCollectionItemsRelations = relations(userCollectionItems, ({many}) => ({
	userCollectionItemValuations: many(userCollectionItemValuations),
}));

export const userWishlistItemsRelations = relations(userWishlistItems, ({one}) => ({
	marketItem: one(marketItems, {
		fields: [userWishlistItems.marketItemId],
		references: [marketItems.id]
	}),
}));

export const ygoCardPricesRelations = relations(ygoCardPrices, ({one}) => ({
	ygoCard: one(ygoCards, {
		fields: [ygoCardPrices.cardId],
		references: [ygoCards.cardId]
	}),
}));

export const ygoCardsRelations = relations(ygoCards, ({many}) => ({
	ygoCardPrices: many(ygoCardPrices),
	ygoCardPricesHistories: many(ygoCardPricesHistory),
	ygoCardBanlists: many(ygoCardBanlist),
	ygoCardImages: many(ygoCardImages),
	ygoCardSets: many(ygoCardSets),
}));

export const ygoCardPricesHistoryRelations = relations(ygoCardPricesHistory, ({one}) => ({
	ygoCard: one(ygoCards, {
		fields: [ygoCardPricesHistory.cardId],
		references: [ygoCards.cardId]
	}),
}));

export const ygoCardBanlistRelations = relations(ygoCardBanlist, ({one}) => ({
	ygoCard: one(ygoCards, {
		fields: [ygoCardBanlist.cardId],
		references: [ygoCards.cardId]
	}),
}));

export const scryfallCatalogValuesRelations = relations(scryfallCatalogValues, ({one}) => ({
	scryfallCatalog: one(scryfallCatalogs, {
		fields: [scryfallCatalogValues.catalogKey],
		references: [scryfallCatalogs.key]
	}),
}));

export const scryfallCatalogsRelations = relations(scryfallCatalogs, ({many}) => ({
	scryfallCatalogValues: many(scryfallCatalogValues),
}));

export const ygoCardImagesRelations = relations(ygoCardImages, ({one}) => ({
	ygoCard: one(ygoCards, {
		fields: [ygoCardImages.cardId],
		references: [ygoCards.cardId]
	}),
}));

export const ygoCardSetsRelations = relations(ygoCardSets, ({one}) => ({
	ygoCard: one(ygoCards, {
		fields: [ygoCardSets.cardId],
		references: [ygoCards.cardId]
	}),
}));

export const marketItemExternalIdsRelations = relations(marketItemExternalIds, ({one}) => ({
	marketItem: one(marketItems, {
		fields: [marketItemExternalIds.marketItemId],
		references: [marketItems.id]
	}),
}));

export const marketPriceDailyRelations = relations(marketPriceDaily, ({one}) => ({
	marketItem: one(marketItems, {
		fields: [marketPriceDaily.marketItemId],
		references: [marketItems.id]
	}),
}));

export const marketPriceSnapshotsRelations = relations(marketPriceSnapshots, ({one}) => ({
	marketItem: one(marketItems, {
		fields: [marketPriceSnapshots.marketItemId],
		references: [marketItems.id]
	}),
}));