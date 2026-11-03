export const MEASUREMENT_KEYS = [
  'height',
  'chest',
  'waist',
  'hips',
  'shoulders',
  'sleeve',
  'insole',
  'ringSize',
] as const;
export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];
export type Person = 'andrii' | 'juliette';

export interface Measurement {
  key: MeasurementKey;
  label: string;
  value: string;
  unit?: string;
}

export const sizes = {
  andrii: [
    { key: 'height', label: 'Height (Зріст)', value: '172-174', unit: 'cm' },
    { key: 'chest', label: 'Chest (Груди)', value: '92', unit: 'cm' },
    { key: 'waist', label: 'Waist (Талія)', value: '78', unit: 'cm' },
    { key: 'hips', label: 'Hips (Стегна)', value: '93', unit: 'cm' },
    { key: 'shoulders', label: 'Shoulders (Плечі)', value: '45', unit: 'cm' },
    { key: 'sleeve', label: 'Sleeve (Рукав)', value: '59-60', unit: 'cm' },
    { key: 'insole', label: 'Insole (Устілка)', value: '26', unit: 'cm' },
    { key: 'ringSize', label: 'Ring Size (Кільце)', value: '18-19', unit: 'mm' },
  ],
  juliette: [
    { key: 'height', label: 'Height (Зріст)', value: '164', unit: 'cm' },
    { key: 'chest', label: 'Chest (Груди)', value: '85', unit: 'cm' },
    { key: 'waist', label: 'Waist (Талія)', value: '63', unit: 'cm' },
    { key: 'hips', label: 'Hips (Стегна)', value: '95', unit: 'cm' },
    { key: 'shoulders', label: 'Shoulders (Плечі)', value: '40', unit: 'cm' },
    { key: 'sleeve', label: 'Sleeve (Рукав)', value: '55', unit: 'cm' },
    { key: 'insole', label: 'Insole (Устілка)', value: '24', unit: 'cm' },
    { key: 'ringSize', label: 'Ring Size (Кільце)', value: '17.5-18', unit: 'mm' },
  ],
} satisfies Record<Person, Measurement[]>;
