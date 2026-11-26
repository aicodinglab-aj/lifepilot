import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { IconButton } from "@/components/ui/button";
import {
  iconSizes,
  radii,
  spacing,
  typography,
} from "@/constants/design-system";
import { useAppearance } from "@/features/appearance/appearance-provider";

type ModuleIconName = ComponentProps<typeof SymbolView>["name"];

function ModuleCard({
  title,
  icon,
  onPress,
  width,
  height,
}: {
  title: string;
  icon: ModuleIconName;
  onPress: () => void;
  width: number;
  height: number;
}) {
  const { colors } = useAppearance();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        minHeight: height,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.controlBorder,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.md,
        opacity: pressed ? 0.76 : 1,
      })}
    >
      <View
        accessible={false}
        style={{
          width: 56,
          height: 56,
          borderRadius: radii.md,
          backgroundColor: colors.surfaceSecondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView
          name={icon}
          size={iconSizes.card}
          tintColor={colors.success}
        />
      </View>
      <Text
        style={[
          typography.cardTitle,
          {
            color: colors.text,
            textAlign: "center",
            flexShrink: 1,
          },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const appearance = useAppearance();
  const { colors } = appearance;
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const gridWidth = Math.min(Math.max(0, windowWidth - spacing.base * 2), 600);
  const cardWidth = (gridWidth - spacing.md) / 2;
  const cardHeight = Math.max(
    cardWidth,
    148,
    132 * fontScale + (fontScale > 1.15 ? 32 : 0),
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingHorizontal: spacing.base,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xl,
        gap: spacing.lg,
        alignItems: "center",
      }}
    >
      <StatusBar
        barStyle={appearance.isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <View style={{ width: "100%", maxWidth: 600, gap: spacing.xs }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          }}
        >
          <Text
            accessibilityRole='header'
            style={[
              typography.hero,
              { color: colors.text, flex: 1, minWidth: 0 },
            ]}
          >
            Life<Text style={{ color: colors.primary }}>Pilot</Text>
          </Text>
          <IconButton
            accessibilityLabel='Settings and appearance'
            onPress={() => router.push("/settings")}
            icon={
              <SymbolView
                name={{
                  ios: "gearshape",
                  android: "settings",
                  web: "settings",
                }}
                size={iconSizes.navigation}
                tintColor={colors.primary}
              />
            }
          />
        </View>
        <Text style={[typography.body, { color: colors.muted }]}>
          Your everyday life, organised.
        </Text>
      </View>

      <View style={{ width: gridWidth, gap: spacing.md }}>
        <Text
          accessibilityRole='header'
          style={[typography.sectionHeading, { color: colors.text }]}
        >
          Overview
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <ModuleCard
            title='Reminders'
            width={cardWidth}
            height={cardHeight}
            icon={{
              ios: "bell",
              android: "notifications",
              web: "notifications",
            }}
            onPress={() => router.push("/reminders")}
          />
          <ModuleCard
            title='Vehicle Manager'
            width={cardWidth}
            height={cardHeight}
            icon={{
              ios: "car",
              android: "directions_car",
              web: "directions_car",
            }}
            onPress={() => router.push("/vehicle-manager")}
          />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <ModuleCard
            title='Personal Finance'
            width={cardWidth}
            height={cardHeight}
            icon={{
              ios: "wallet.pass",
              android: "account_balance_wallet",
              web: "account_balance_wallet",
            }}
            onPress={() => router.push("/personal")}
          />
          <ModuleCard
            title='Tasks'
            width={cardWidth}
            height={cardHeight}
            icon={{ ios: "checklist", android: "checklist", web: "checklist" }}
            onPress={() => router.push("/tasks")}
          />
        </View>
      </View>
    </ScrollView>
  );
}
