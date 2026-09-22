import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabs } from './MainTabs';
import { GroupScreen } from '../screens/GroupScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { GroupMapScreen } from '../screens/GroupMapScreen';
import { MembersScreen } from '../screens/MembersScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AdvancedScreen } from '../screens/AdvancedScreen';
import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { LocationDiagnosticsScreen } from '../screens/LocationDiagnosticsScreen';
import { CreateGroupScreen } from '../screens/CreateGroupScreen';
import { JoinGroupScreen } from '../screens/JoinGroupScreen';
import { colors, typography } from '../theme';

export type RootStackParamList = {
  MainTabs: undefined;
  Group: { groupId: string };
  Chat: { groupId?: string } | undefined;
  Map: { groupId?: string } | undefined;
  Members: { groupId: string };
  CreateGroup: undefined;
  JoinGroup: undefined;
  Settings: undefined;
  Advanced: undefined;
  Diagnostics: undefined;
  LocationDiagnostics: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          ...typography.title,
          color: colors.textPrimary,
        },
        headerTitleAlign: 'center',
        headerShadowVisible: false,
        headerBackTitle: '',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Group"
        component={GroupScreen}
        options={{ title: 'Group' }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'Chat' }}
      />
      <Stack.Screen
        name="Map"
        component={GroupMapScreen}
        options={{ title: 'Group map' }}
      />
      <Stack.Screen
        name="Members"
        component={MembersScreen}
        options={{ title: 'Members' }}
      />
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={{ title: 'Create group' }}
      />
      <Stack.Screen
        name="JoinGroup"
        component={JoinGroupScreen}
        options={{ title: 'Join a group' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name="Advanced"
        component={AdvancedScreen}
        options={{ title: 'Advanced' }}
      />
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ title: 'Diagnostics' }}
      />
      <Stack.Screen
        name="LocationDiagnostics"
        component={LocationDiagnosticsScreen}
        options={{ title: 'Location' }}
      />
    </Stack.Navigator>
  );
}
