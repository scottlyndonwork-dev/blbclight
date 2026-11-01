import { describe, expect, it } from "vitest";
import {
  buildPlaceholderValues,
  missingRequiredFields,
  parseTemplateFields,
  placeholdersIn,
  renderTemplate,
} from "@/features/certificates/template";

describe("certificate templates", () => {
  it("finds and fills placeholders", () => {
    const body = "{{full_name}} was baptized on {{ baptism_date }} at {{baptism_location}}.";
    expect(placeholdersIn(body)).toEqual(["full_name", "baptism_date", "baptism_location"]);
    expect(renderTemplate(body, { full_name: "Juan Dela Cruz", baptism_date: "January 12, 2020" })).toBe(
      "Juan Dela Cruz was baptized on January 12, 2020 at __________.",
    );
  });

  it("builds values from the member, church and custom fields", () => {
    const values = buildPlaceholderValues({
      member: {
        first_name: "Juan",
        middle_name: "Santos",
        last_name: "Dela Cruz",
        suffix: null,
        member_no: "LGT-2025-00001",
        birthdate: "1990-05-21",
        membership_date: null,
        date_registered: "2024-01-07",
        baptism: { baptism_date: "2020-01-12", location: "Main Sanctuary", officiant: "Rev. Ramos" },
      },
      recipientName: "Juan Santos Dela Cruz",
      churchName: "Grace Bible Church",
      issuedOn: "2025-03-01",
      fields: [{ key: "dedication_date", label: "Dedication date", type: "date", required: true }],
      fieldValues: { dedication_date: "2025-02-14" },
    });
    expect(values).toMatchObject({
      full_name: "Juan Santos Dela Cruz",
      membership_date: "January 7, 2024",
      baptism_date: "January 12, 2020",
      issued_on: "March 1, 2025",
      dedication_date: "February 14, 2025",
      church_name: "Grace Bible Church",
    });
  });

  it("validates template field definitions and required values", () => {
    const fields = parseTemplateFields([
      { key: "spouse_name", label: "Spouse", type: "text", required: true },
      { key: "Bad Key", label: "x", type: "text", required: false },
    ]);
    expect(fields).toEqual([]); // one invalid entry rejects the whole definition
    const ok = parseTemplateFields([{ key: "spouse_name", label: "Spouse", type: "text", required: true }]);
    expect(missingRequiredFields(ok, { spouse_name: " " })).toHaveLength(1);
    expect(missingRequiredFields(ok, { spouse_name: "Maria" })).toHaveLength(0);
  });
});
