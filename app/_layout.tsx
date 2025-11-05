import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,       // ✅ يخفي الشريط العلوي تمامًا
          contentStyle: { backgroundColor: "#0f0f0f" }, // ✅ يطابق خلفية التطبيق
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}