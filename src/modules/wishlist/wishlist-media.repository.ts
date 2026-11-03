import {
  FieldValue,
  Timestamp,
  type Transaction,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { getDatabase } from '@/lib/server/firebase';
import { HttpError } from '@/lib/server/http';
import { isWishlistImagePublicId } from './constants/image';
import { parseUpdateItem } from './wishlist.validation';
import { mapImageMetadata } from './utils/image';
import type { WishlistImageMetadata } from './wishlist.types';

export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
type ImageState = 'uploading' | 'ready' | 'attached' | 'retired' | 'deleting' | 'deleted';
interface ImageRecord {
  publicId: string;
  cloudName: string;
  state: ImageState;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  itemId?: string;
  image?: WishlistImageMetadata;
}

export class WishlistMediaRepository {
  static document(publicId: string) {
    if (!isWishlistImagePublicId(publicId)) throw new HttpError(400, 'Invalid wishlist image ID');
    return getDatabase()
      .collection('wishlistImages')
      .doc(Buffer.from(publicId).toString('base64url'));
  }

  private static record(snapshot: DocumentSnapshot): ImageRecord | null {
    const data = snapshot.data();
    if (!data) return null;
    if (
      data.v !== 1 ||
      !isWishlistImagePublicId(data.publicId) ||
      typeof data.cloudName !== 'string' ||
      !data.cloudName ||
      !['uploading', 'ready', 'attached', 'retired', 'deleting', 'deleted'].includes(data.state) ||
      !(data.createdAt instanceof Timestamp) ||
      !(data.updatedAt instanceof Timestamp)
    ) {
      throw new Error('Invalid stored image ownership record');
    }
    return {
      publicId: data.publicId,
      cloudName: data.cloudName,
      state: data.state,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      itemId: data.itemId,
      image: data.image,
    };
  }

  static async reserve(publicId: string, cloudName: string): Promise<void> {
    await this.document(publicId).create({
      v: 1,
      publicId,
      cloudName,
      state: 'uploading',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  static async ready(publicId: string, image: WishlistImageMetadata): Promise<void> {
    await getDatabase().runTransaction(async (transaction) => {
      const ref = this.document(publicId);
      const record = this.record(await transaction.get(ref));
      if (record?.state !== 'uploading') throw new HttpError(409, 'Upload is no longer available');
      transaction.update(ref, { state: 'ready', image, updatedAt: FieldValue.serverTimestamp() });
    });
  }

  static async attachment(
    transaction: Transaction,
    publicId: string
  ): Promise<ImageRecord & { image: WishlistImageMetadata }> {
    const record = this.record(await transaction.get(this.document(publicId)));
    if (
      !record ||
      record.publicId !== publicId ||
      !record.image ||
      !['ready', 'attached'].includes(record.state) ||
      record.image.publicId !== publicId
    ) {
      throw new HttpError(409, 'Image is unavailable. Refresh the form and select it again.');
    }
    parseUpdateItem(mapImageMetadata(record.image));
    return { ...record, image: record.image };
  }

  static attach(transaction: Transaction, publicId: string, itemId: string): void {
    transaction.update(this.document(publicId), {
      state: 'attached',
      itemId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  static async retirement(
    transaction: Transaction,
    publicId: unknown,
    itemId: string
  ): Promise<string | null> {
    if (!isWishlistImagePublicId(publicId)) return null;
    const record = this.record(await transaction.get(this.document(publicId)));
    return record?.state === 'attached' && record.itemId === itemId ? publicId : null;
  }

  static retire(transaction: Transaction, publicId: string): void {
    transaction.update(this.document(publicId), {
      state: 'retired',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  private static async referenced(transaction: Transaction, record: ImageRecord): Promise<boolean> {
    const items = getDatabase().collection('items');
    const byId = await transaction.get(
      items.where('imagePublicId', '==', record.publicId).limit(1)
    );
    if (!byId.empty) return true;
    if (!record.image) return false;
    const byUrl = await transaction.get(
      items.where('imageUrl', '==', record.image.secureUrl).limit(1)
    );
    return !byUrl.empty;
  }

  static async claimCleanup(
    publicId: string,
    cloudName: string,
    recovery = false,
    now = Date.now()
  ): Promise<boolean> {
    return getDatabase().runTransaction(async (transaction) => {
      const ref = this.document(publicId);
      const record = this.record(await transaction.get(ref));
      if (
        !record ||
        record.publicId !== publicId ||
        record.cloudName !== cloudName ||
        ['attached', 'deleted'].includes(record.state)
      )
        return false;
      if (!recovery && record.state !== 'retired') return false;
      if (
        recovery &&
        (record.createdAt.toMillis() > now - ORPHAN_GRACE_MS ||
          record.updatedAt.toMillis() > now - ORPHAN_GRACE_MS)
      )
        return false;
      if (await this.referenced(transaction, record)) return false;
      transaction.update(ref, { state: 'deleting', updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
  }

  static async markDeleted(publicId: string): Promise<void> {
    await this.document(publicId).update({
      state: 'deleted',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  static async inspectOrphans(
    now = Date.now()
  ): Promise<{ publicId: string; cloudName: string; state: ImageState; referenced: boolean }[]> {
    const snapshot = await getDatabase().collection('wishlistImages').get();
    const candidates = [];
    for (const document of snapshot.docs) {
      const record = this.record(document);
      if (
        !record ||
        ['attached', 'deleted'].includes(record.state) ||
        record.createdAt.toMillis() > now - ORPHAN_GRACE_MS ||
        record.updatedAt.toMillis() > now - ORPHAN_GRACE_MS
      )
        continue;
      const referenced = await getDatabase().runTransaction((transaction) =>
        this.referenced(transaction, record)
      );
      candidates.push({
        publicId: record.publicId,
        cloudName: record.cloudName,
        state: record.state,
        referenced,
      });
    }
    return candidates;
  }
}
