export function buildWearEventPayload({ wornOn, itemIds, outfitId, occasion, notes }, requestId) {
  return {
    worn_on: wornOn,
    item_ids: [...new Set(itemIds)],
    outfit_id: outfitId || null,
    occasion: occasion || null,
    notes: notes || null,
    request_id: requestId || null,
  }
}
