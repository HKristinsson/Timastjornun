import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { myAccess, listInbox, listAnnouncements } from "@/lib/mail";

interface ActiveEntry {
  id: string;
  project_name: string;
  project_no: string;
  check_in_at: string;
}

function Card({
  title,
  subtitle,
  badge,
  onPress,
}: {
  title: string;
  subtitle: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.linkRow} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.linkSub}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.chev}>›</Text>
    </TouchableOpacity>
  );
}

export default function Home() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMail, setHasMail] = useState(false);
  const [unreadMail, setUnreadMail] = useState(0);
  const [unreadAnn, setUnreadAnn] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("v_my_active_entry")
      .select("id, project_name, project_no, check_in_at")
      .maybeSingle();
    setActive((data as ActiveEntry) ?? null);
    setLoading(false);

    myAccess()
      .then(async (a) => {
        setHasMail(a.hasMail);
        if (a.hasMail) {
          const inbox = await listInbox();
          setUnreadMail(inbox.filter((m) => !m.read_at).length);
        }
      })
      .catch(() => {});
    listAnnouncements()
      .then((anns) => setUnreadAnn(anns.filter((a) => !a.read_at).length))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Tímaverk</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signout}>Útskrá</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>STAÐA NÚNA</Text>
        {loading ? (
          <Text style={styles.muted}>Hleð…</Text>
        ) : active ? (
          <>
            <Text style={styles.statusActive}>🟢 Innskráð(ur)</Text>
            <Text style={styles.project}>
              {active.project_no} {active.project_name}
            </Text>
            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={() => router.push("/active")}
            >
              <Text style={styles.buttonText}>Opna virka skráningu</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.statusIdle}>⚫ Ekki innskráð(ur)</Text>
            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={() => router.push("/project-select")}
            >
              <Text style={styles.buttonText}>+ Skrá inn á verkefni</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {hasMail && (
        <Card
          title="💬 Skilaboð"
          subtitle="Innhólf og send skeyti"
          badge={unreadMail}
          onPress={() => router.push("/messages")}
        />
      )}
      <Card
        title="🔔 Tilkynningar"
        subtitle="Skilaboð frá stjórnendum — kvittaðu fyrir lestur"
        badge={unreadAnn}
        onPress={() => router.push("/announcements")}
      />
      <Card
        title="🤒 Skrá veikindi"
        subtitle="Tilkynna veikindadaga til verkstjóra"
        onPress={() => router.push("/sick")}
      />
      <Card
        title="📋 Tímayfirlit"
        subtitle="Skráðir tímar og staða samþykktar"
        onPress={() => router.push("/timesheet")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, backgroundColor: "#f1f5f9", flexGrow: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  signout: { color: "#64748b" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, marginBottom: 14 },
  cardLabel: { fontSize: 12, color: "#94a3b8", fontWeight: "600", marginBottom: 8 },
  statusActive: { fontSize: 18, fontWeight: "600", color: "#16a34a" },
  statusIdle: { fontSize: 18, fontWeight: "600", color: "#475569" },
  project: { fontSize: 16, marginTop: 4, marginBottom: 8, color: "#1e293b" },
  muted: { color: "#94a3b8" },
  buttonPrimary: { backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkRow: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  linkTitle: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  linkSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  badge: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  badgeText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  chev: { fontSize: 22, color: "#cbd5e1" },
});
