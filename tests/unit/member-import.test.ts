import { describe, expect, it } from "vitest";
import { mapHeaders, normalizeDate, parseImportRows } from "@/features/members/import-parse";
import { sanitizeCell } from "@/server/exports/sanitize";

describe("member import parsing", () => {
  it("recognizes headers and aliases case-insensitively", () => {
    const { map, unknown } = mapHeaders(["FIRST NAME", "Surname", "Mobile", "Favorite color"]);
    expect([...map.values()]).toEqual(["first_name", "last_name", "contact_number"]);
    expect(unknown).toEqual(["Favorite color"]);
  });

  it("normalizes common date formats", () => {
    expect(normalizeDate("1990-05-21")).toBe("1990-05-21");
    expect(normalizeDate("5/21/1990")).toBe("1990-05-21");
    expect(normalizeDate(32999)).toBe("1990-05-06"); // Excel serial
    expect(normalizeDate(new Date(Date.UTC(2000, 0, 2)))).toBe("2000-01-02");
  });

  it("validates rows and reports problems with row numbers", () => {
    const result = parseImportRows(
      [
        { "First name": "Juan", "Last name": "Dela Cruz", Gender: "M", Birthdate: "1990-05-21" },
        { "First name": "", "Last name": "NoFirst" },
        { "First name": "Bad", "Last name": "Email", Email: "nope" },
        { "First name": "Juan", "Last name": "Dela Cruz", Birthdate: "1990-05-21" },
        { "First name": "", "Last name": "" },
      ],
      ["First name", "Last name", "Gender", "Birthdate", "Email"],
    );
    expect(result.total).toBe(4);
    expect(result.valid.map((v) => v.row)).toEqual([2, 5]);
    expect(result.valid[0].values.gender).toBe("male");
    expect(result.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(result.warnings[0]).toMatch(/Row 5 .* duplicate of row 2/);
  });

  it("requires name columns", () => {
    const result = parseImportRows([{ Email: "a@b.co" }], ["Email"]);
    expect(result.errors[0].messages[0]).toMatch(/First name/);
  });
});

describe("export sanitization", () => {
  it("neutralizes spreadsheet formulas", () => {
    expect(sanitizeCell("=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")");
    expect(sanitizeCell("+639171234567")).toBe("'+639171234567");
    expect(sanitizeCell("Juan")).toBe("Juan");
  });
});
