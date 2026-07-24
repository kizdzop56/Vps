import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// On web: localStorage persists across browser sessions (user stays logged in).
// On native (iOS / Android): AsyncStorage is persistent across app restarts.
const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  },
};

export default authStorage;
