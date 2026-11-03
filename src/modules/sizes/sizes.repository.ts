import { FieldValue } from 'firebase-admin/firestore';
import { sizes, type Measurement, type Person } from '@/data/sizes';
import { getDatabase } from '@/lib/server/firebase';
import { isMeasurementValue, type MeasurementUpdates } from './sizes.validation';

function storedValues(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid stored measurements');
  return value as Record<string, unknown>;
}

export class SizesRepository {
  static async find(person: Person): Promise<Measurement[]> {
    const snapshot = await getDatabase().collection('sizes').doc(person).get();
    const data = snapshot.data();
    const values = data?.values === undefined ? {} : storedValues(data.values);
    return sizes[person].map((measurement) => {
      const value = values[measurement.key];
      if (value === undefined) return { ...measurement };
      if (!isMeasurementValue(value)) throw new Error('Invalid stored measurement value');
      return { ...measurement, value };
    });
  }

  static async update(person: Person, updates: MeasurementUpdates): Promise<void> {
    const database = getDatabase();
    const ref = database.collection('sizes').doc(person);
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      const values = data?.values === undefined ? {} : storedValues(data.values);
      const payload = {
        values: { ...values, ...updates },
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (snapshot.exists) transaction.update(ref, payload);
      else transaction.create(ref, payload);
    });
  }
}
