// Litlu táknin í þema appsins (tillaga A): blá útlínutákn á fölbláum hring.
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  name: IoniconName;
  /** Þvermál hringsins (sjálfgefið 44) */
  size?: number;
  /** Litur táknsins (sjálfgefið appblár) */
  color?: string;
}

export default function ThemeIcon({ name, size = 44, color = "#2563eb" }: Props) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Ionicons name={name} size={Math.round(size * 0.55)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
});
