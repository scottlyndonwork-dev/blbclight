import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatPeso } from "@/lib/money";
import type { ReportTable } from "@/server/reports";

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 8.5, color: "#16233a" },
  header: { marginBottom: 12, borderBottomWidth: 1.5, borderBottomColor: "#1f4e96", paddingBottom: 6 },
  church: { fontSize: 9, color: "#5d6b80" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#16273d", marginTop: 2 },
  subtitle: { fontSize: 9, color: "#5d6b80", marginTop: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3 },
  headRow: { flexDirection: "row", backgroundColor: "#e8eff9", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#1f4e96" },
  totalRow: { flexDirection: "row", paddingVertical: 4, borderTopWidth: 1, borderTopColor: "#16233a" },
  cell: { flex: 1, paddingHorizontal: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#5d6b80" },
});

function display(value: string, money?: boolean) {
  return money ? formatPeso(value).replace("₱", "PHP ") : value;
}

/** Generic, print-friendly table report. */
export async function renderReportPdf(table: ReportTable, meta: { churchName: string; generatedBy: string; generatedAt: string }) {
  const wide = table.columns.length > 6;
  const align = (i: number) => (table.columns[i]?.align === "right" ? "right" : "left") as "right" | "left";
  const doc = (
    <Document title={table.title} author={meta.churchName} creator="LIGHT">
      <Page size="A4" orientation={wide ? "landscape" : "portrait"} style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.church}>{meta.churchName}</Text>
          <Text style={styles.title}>{table.title}</Text>
          <Text style={styles.subtitle}>{table.subtitle}</Text>
        </View>
        <View style={styles.headRow} fixed>
          {table.columns.map((c, i) => (
            <Text key={c.header} style={[styles.cell, styles.bold, { textAlign: align(i) }]}>
              {c.header}
            </Text>
          ))}
        </View>
        {table.rows.length === 0 ? (
          <Text style={{ marginTop: 10, color: "#5d6b80" }}>No records for the selected filters.</Text>
        ) : (
          table.rows.map((row, r) => (
            <View key={r} style={styles.row} wrap={false}>
              {row.map((v, i) => (
                <Text key={i} style={[styles.cell, { textAlign: align(i) }]}>
                  {display(v, table.columns[i]?.money)}
                </Text>
              ))}
            </View>
          ))
        )}
        {table.totals && (
          <View style={styles.totalRow} wrap={false}>
            {table.totals.map((v, i) => (
              <Text key={i} style={[styles.cell, styles.bold, { textAlign: align(i) }]}>
                {v ? display(v, table.columns[i]?.money) : ""}
              </Text>
            ))}
          </View>
        )}
        <View style={styles.footer} fixed>
          <Text>
            Generated {meta.generatedAt} by {meta.generatedBy} · LIGHT · Confidential
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
