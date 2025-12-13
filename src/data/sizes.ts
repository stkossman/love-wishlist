export interface Measurement {
  label: string;
  value: string;
  unit?: string;
}

export const sizes = {
  andrii: [
    { label: 'Height (Зріст)', value: '172-174', unit: 'cm' },
    { label: 'Chest (Груди)', value: '92', unit: 'cm' },
    { label: 'Waist (Талія)', value: '78', unit: 'cm' },
    { label: 'Hips (Стегна)', value: '93', unit: 'cm' },
    { label: 'Shoulders (Плечі)', value: '45', unit: 'cm' },
    { label: 'Sleeve (Рукав)', value: '59-60', unit: 'cm' },
    { label: 'Insole (Устілка)', value: '26', unit: 'cm' },
    { label: 'Ring Size (Кільце)', value: '18-19', unit: 'mm' },
  ],
  juliette: [
    { label: 'Height (Зріст)', value: '165', unit: 'cm' },
    { label: 'Chest (Груди)', value: '88', unit: 'cm' },
    { label: 'Waist (Талія)', value: '62', unit: 'cm' },
    { label: 'Hips (Стегна)', value: '92', unit: 'cm' },
    { label: 'Shoulders (Плечі)', value: '38', unit: 'cm' },
    { label: 'Sleeve (Рукав)', value: '58', unit: 'cm' },
    { label: 'Insole (Устілка)', value: '24.5', unit: 'cm' },
    { label: 'Ring Size (Кільце)', value: '16.5', unit: 'mm' },
  ],
};
