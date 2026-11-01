/** Spreadsheet columns recognized by the member importer (header matching is case-insensitive). */
export const IMPORT_COLUMNS = [
  { key: "first_name", header: "First name", aliases: ["firstname", "given name"], example: "Juan", help: "Required." },
  { key: "middle_name", header: "Middle name", aliases: ["middlename"], example: "Santos", help: "Optional." },
  { key: "last_name", header: "Last name", aliases: ["lastname", "surname", "family name"], example: "Dela Cruz", help: "Required." },
  { key: "suffix", header: "Suffix", aliases: [], example: "Jr.", help: "Optional, e.g. Jr., Sr., III." },
  { key: "gender", header: "Gender", aliases: ["sex"], example: "Male", help: "Male or Female." },
  { key: "civil_status", header: "Civil status", aliases: ["civil", "marital status"], example: "Married", help: "Single, Married, Widowed, Separated or Annulled." },
  { key: "birthdate", header: "Birthdate", aliases: ["birthday", "date of birth", "dob"], example: "1990-05-21", help: "YYYY-MM-DD." },
  { key: "contact_number", header: "Contact number", aliases: ["mobile", "phone", "contact", "mobile number"], example: "0917 123 4567", help: "Optional." },
  { key: "email", header: "Email", aliases: ["email address", "e-mail"], example: "juan@example.com", help: "Optional." },
  { key: "address_line", header: "Address", aliases: ["street", "house no", "address line"], example: "123 Rizal St.", help: "House number and street." },
  { key: "barangay", header: "Barangay", aliases: ["brgy"], example: "San Isidro", help: "Optional." },
  { key: "city", header: "City", aliases: ["municipality", "city/municipality", "town"], example: "Quezon City", help: "Optional." },
  { key: "province", header: "Province", aliases: [], example: "Metro Manila", help: "Optional." },
  { key: "postal_code", header: "Postal code", aliases: ["zip", "zip code"], example: "1100", help: "4 digits." },
  { key: "date_registered", header: "Date registered", aliases: ["registered", "registration date"], example: "2024-01-07", help: "Defaults to today when blank." },
  { key: "membership_date", header: "Membership date", aliases: ["member since"], example: "2024-03-03", help: "Optional." },
  { key: "previous_church", header: "Previous church", aliases: [], example: "", help: "Optional." },
  { key: "notes", header: "Notes", aliases: ["remarks"], example: "", help: "Optional." },
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];
