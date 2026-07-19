// Teikna/skrifa á mynd áður en hún er send: 4 skærir litir og 4 pennaþykktir.
// Myndin + strokurnar eru "myndaðar" saman (react-native-view-shot) í nýja JPEG.
import { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  PanResponder,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import Svg, { Polyline } from "react-native-svg";
import ViewShot, { captureRef } from "react-native-view-shot";

const COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#00b0ff"]; // rautt, gult, grænt, blátt
const PENS = [
  { label: "1", width: 3 },
  { label: "2", width: 6 },
  { label: "3", width: 10 },
  { label: "4", width: 14 },
];

interface Stroke {
  color: string;
  width: number;
  points: string; // "x,y x,y …" fyrir SVG Polyline
}

interface Props {
  visible: boolean;
  uri: string;
  imageWidth?: number;
  imageHeight?: number;
  onCancel: () => void;
  // Skilar nýju myndinni (base64 JPEG + data-uri til forskoðunar)
  onSave: (base64: string, uri: string) => void;
}

export default function PhotoAnnotator({
  visible,
  uri,
  imageWidth,
  imageHeight,
  onCancel,
  onSave,
}: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [pen, setPen] = useState(PENS[1]);
  const [saving, setSaving] = useState(false);
  const shotRef = useRef<View>(null);

  const screenW = Dimensions.get("window").width;
  const canvasW = screenW - 24;
  const ratio =
    imageWidth && imageHeight && imageWidth > 0 ? imageHeight / imageWidth : 4 / 3;
  const canvasH = Math.min(canvasW * ratio, Dimensions.get("window").height * 0.6);

  const currentRef = useRef<Stroke | null>(null);
  const colorRef = useRef(color);
  const penRef = useRef(pen);
  colorRef.current = color;
  penRef.current = pen;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const s: Stroke = {
          color: colorRef.current,
          width: penRef.current.width,
          points: `${locationX.toFixed(1)},${locationY.toFixed(1)}`,
        };
        currentRef.current = s;
        setCurrent(s);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const s = currentRef.current;
        if (!s) return;
        const upd = {
          ...s,
          points: `${s.points} ${locationX.toFixed(1)},${locationY.toFixed(1)}`,
        };
        currentRef.current = upd;
        setCurrent(upd);
      },
      onPanResponderRelease: () => {
        const s = currentRef.current;
        if (s) setStrokes((arr) => [...arr, s]);
        currentRef.current = null;
        setCurrent(null);
      },
    })
  ).current;

  async function save() {
    setSaving(true);
    try {
      const base64 = await captureRef(shotRef, {
        format: "jpg",
        quality: 0.85,
        result: "base64",
      });
      const clean = base64.replace(/\s/g, "");
      onSave(clean, `data:image/jpeg;base64,${clean}`);
      reset();
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStrokes([]);
    setCurrent(null);
  }

  const all = current ? [...strokes, current] : strokes;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <Text style={styles.title}>✏️ Teikna á mynd</Text>

        <ViewShot ref={shotRef} style={{ width: canvasW, height: canvasH }}>
          <View style={{ width: canvasW, height: canvasH }} {...pan.panHandlers}>
            <Image
              source={{ uri }}
              style={{ width: canvasW, height: canvasH }}
              resizeMode="cover"
            />
            <Svg
              style={StyleSheet.absoluteFill}
              width={canvasW}
              height={canvasH}
              pointerEvents="none"
            >
              {all.map((s, i) => (
                <Polyline
                  key={i}
                  points={s.points}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
          </View>
        </ViewShot>

        {/* Litir */}
        <View style={styles.toolRow}>
          {COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.colorDot,
                { backgroundColor: c },
                color === c && styles.colorDotActive,
              ]}
              onPress={() => setColor(c)}
            />
          ))}
          <View style={styles.toolDivider} />
          {PENS.map((p) => (
            <TouchableOpacity
              key={p.label}
              style={[styles.penButton, pen.label === p.label && styles.penButtonActive]}
              onPress={() => setPen(p)}
            >
              <View
                style={{
                  width: Math.max(p.width, 4),
                  height: Math.max(p.width, 4),
                  borderRadius: p.width,
                  backgroundColor: pen.label === p.label ? "#fff" : "#334155",
                }}
              />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.ghostButton}
            onPress={() => setStrokes((arr) => arr.slice(0, -1))}
            disabled={strokes.length === 0}
          >
            <Text style={styles.ghostText}>↩︎ Afturkalla</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostButton} onPress={reset}>
            <Text style={styles.ghostText}>Hreinsa</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              reset();
              onCancel();
            }}
          >
            <Text style={styles.cancelText}>Hætta við</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>✓ Vista mynd</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 12,
  },
  title: { color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: 14 },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
  },
  colorDot: { width: 34, height: 34, borderRadius: 17, opacity: 0.85 },
  colorDotActive: {
    opacity: 1,
    borderWidth: 3,
    borderColor: "#fff",
    transform: [{ scale: 1.15 }],
  },
  toolDivider: { width: 1, height: 28, backgroundColor: "#334155", marginHorizontal: 4 },
  penButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  penButtonActive: { backgroundColor: "#2563eb" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  ghostButton: {
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  ghostText: { color: "#cbd5e1", fontWeight: "600", fontSize: 13 },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: "auto",
    marginBottom: 32,
    alignSelf: "stretch",
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  cancelText: { color: "#cbd5e1", fontWeight: "700" },
  saveButton: {
    flex: 2,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
