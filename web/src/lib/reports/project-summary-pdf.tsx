import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

type ProjectSummaryTaskRow = {
  title: string;
  status: string;
  assignedTo: string;
  deadline: string | null;
};

type ProjectSummaryPersonTotal = {
  name: string;
  minutes: number;
};

export type ProjectSummaryPdfData = {
  projectName: string;
  projectStatus: string;
  description: string | null;
  tasks: ProjectSummaryTaskRow[];
  members: string[];
  totalMinutes: number;
  byPerson: ProjectSummaryPersonTotal[];
};

const styles = StyleSheet.create({
  page: {
    fontSize: 11,
    padding: 28,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.4,
  },
  heading: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 11,
    color: "#4b5563",
    marginBottom: 14,
  },
  section: {
    marginBottom: 14,
    padding: 10,
    border: "1 solid #e5e7eb",
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  rowLabel: {
    fontWeight: 700,
  },
  muted: {
    color: "#6b7280",
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    borderBottom: "1 solid #d1d5db",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    borderBottom: "1 solid #f3f4f6",
    paddingBottom: 4,
    marginBottom: 4,
  },
  colTitle: { width: "37%", paddingRight: 6 },
  colStatus: { width: "18%", paddingRight: 6 },
  colAssigned: { width: "25%", paddingRight: 6 },
  colDeadline: { width: "20%" },
  bullet: {
    marginBottom: 3,
  },
});

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export async function buildProjectSummaryPdf(
  data: ProjectSummaryPdfData
): Promise<Uint8Array> {
  const document = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.heading}>{data.projectName}</Text>
        <Text style={styles.subheading}>Projektstatus: {data.projectStatus}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beskrivning</Text>
          <Text style={styles.muted}>{data.description || "Ingen beskrivning."}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tidssummering</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total rapporterad tid</Text>
            <Text>{formatMinutes(data.totalMinutes)}</Text>
          </View>
          {data.byPerson.length === 0 ? (
            <Text style={styles.muted}>Ingen tid rapporterad.</Text>
          ) : (
            data.byPerson.map((person) => (
              <View key={person.name} style={styles.row}>
                <Text>{person.name}</Text>
                <Text>{formatMinutes(person.minutes)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Uppgifter</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colTitle}>Titel</Text>
            <Text style={styles.colStatus}>Status</Text>
            <Text style={styles.colAssigned}>Tilldelad</Text>
            <Text style={styles.colDeadline}>Deadline</Text>
          </View>
          {data.tasks.length === 0 ? (
            <Text style={styles.muted}>Inga uppgifter.</Text>
          ) : (
            data.tasks.map((task) => (
              <View key={`${task.title}-${task.deadline ?? "none"}`} style={styles.tableRow}>
                <Text style={styles.colTitle}>{task.title}</Text>
                <Text style={styles.colStatus}>{task.status}</Text>
                <Text style={styles.colAssigned}>{task.assignedTo}</Text>
                <Text style={styles.colDeadline}>{task.deadline ?? "-"}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Medlemmar</Text>
          {data.members.length === 0 ? (
            <Text style={styles.muted}>Inga medlemmar.</Text>
          ) : (
            data.members.map((member) => (
              <Text key={member} style={styles.bullet}>
                - {member}
              </Text>
            ))
          )}
        </View>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(document);
  return new Uint8Array(buffer);
}
