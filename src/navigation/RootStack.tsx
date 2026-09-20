import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';

export type RootStackParamList = {
  Home: undefined;
  Diagnostics: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ headerShown: true, title: 'Diagnostics' }}
      />
    </Stack.Navigator>
  );
}
