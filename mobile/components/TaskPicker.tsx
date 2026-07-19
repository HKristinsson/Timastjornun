// Val á undirnúmeri við innskráningu á verkstað.
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";

export interface ProjectTask {
  id: string;
  task_no: string;
  name: string;
}

interface Props {
  visible: boolean;
  projectName: string;
  tasks: ProjectTask[];
  onPick: (taskId: string | null) => void;
  onCancel: () => void;
}

export default function TaskPicker({
  visible,
  projectName,
  tasks,
  onPick,
  onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Veldu undirnúmer</Text>
          <Text style={styles.subtitle}>{projectName}</Text>

          <ScrollView style={{ maxHeight: 340 }}>
            {tasks.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.row}
                onPress={() => onPick(t.id)}
              >
                <Text style={styles.taskNo}>{t.task_no}</Text>
                <Text style={styles.taskName}>{t.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.row} onPress={() => onPick(null)}>
              <Text style={styles.taskNo}>—</Text>
              <Text style={styles.taskName}>Almenn skráning (ekkert undirnúmer)</Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelText}>Hætta við</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: { backgroundColor: "#fff", borderRadius: 18, padding: 20 },
  title: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  subtitle: { fontSize: 14, color: "#64748b", marginTop: 2, marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  taskNo: {
    backgroundColor: "#eff6ff",
    color: "#2563eb",
    fontWeight: "700",
    fontSize: 13,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "hidden",
    minWidth: 40,
    textAlign: "center",
  },
  taskName: { flex: 1, fontSize: 15, color: "#1e293b" },
  cancel: { marginTop: 14, alignItems: "center", paddingVertical: 10 },
  cancelText: { color: "#64748b", fontWeight: "600" },
});
