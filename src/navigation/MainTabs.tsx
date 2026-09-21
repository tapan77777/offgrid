import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { GroupsScreen } from '../screens/GroupsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { colors, typography } from '../theme';
import { Icon, type IconName } from '../components/Icon';

export type MainTabsParamList = {
  Home: undefined;
  Groups: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const screenOptions: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.brandStrong,
  tabBarInactiveTintColor: colors.textFaint,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    height: Platform.OS === 'ios' ? 78 : 62,
    elevation: 0,
  },
  tabBarLabelStyle: {
    ...typography.tabLabel,
  },
  tabBarItemStyle: {
    paddingVertical: 2,
  },
};

function tabIcon(name: IconName) {
  return function IconRender({
    color,
    focused,
  }: {
    color: string;
    focused: boolean;
  }): React.JSX.Element {
    return (
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Icon name={name} color={color} size={22} />
      </View>
    );
  };
}

export function MainTabs(): React.JSX.Element {
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: tabIcon('home') }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{ tabBarIcon: tabIcon('users') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: tabIcon('person') }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 40,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  iconWrapActive: {
    backgroundColor: colors.brandSoft,
  },
});
