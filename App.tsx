import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import LiveScreen from "./src/screens/LiveScreen";
import TunerScreen from "./src/screens/TunerScreen";

const Tab = createBottomTabNavigator();

const DarkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: "#7c4dff",
    background: "#121212",
    card: "#1e1e1e",
    text: "#ffffff",
    border: "#2a2a2a",
    notification: "#7c4dff",
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={DarkTheme}>
          <StatusBar style="light" />
          <Tab.Navigator
            screenOptions={{
              tabBarStyle: {
                backgroundColor: "#1e1e1e",
                borderTopColor: "#2a2a2a",
              },
              tabBarActiveTintColor: "#7c4dff",
              tabBarInactiveTintColor: "#757575",
              headerStyle: {
                backgroundColor: "#1e1e1e",
              },
              headerTintColor: "#ffffff",
              headerTitleStyle: {
                fontWeight: "700",
              },
            }}
          >
            <Tab.Screen
              name="Live"
              component={LiveScreen}
              options={{
                title: "BPM",
                tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>♩</Text>,
              }}
            />
            <Tab.Screen
              name="Tuner"
              component={TunerScreen}
              options={{
                title: "Tuner",
                tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>♪</Text>,
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
