import { InteractiveCard } from "@/components/ui/card";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Section } from "@/components/ui/section";
import { iconSizes, layout, typography } from "@/constants/design-system";
import { useAppearance } from "@/features/appearance/appearance-provider";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const { colors } = useAppearance();
  const chevron = (
    <SymbolView
      name={{
        ios: "chevron.right",
        android: "chevron_right",
        web: "chevron_right",
      }}
      size={iconSizes.action}
      tintColor={colors.primary}
    />
  );

  return (
    <SafeAreaView
      edges={["left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScreenHeader title='Settings' fallbackHref='/' />
      <ScrollView contentContainerStyle={layout.screenContent}>
        <InteractiveCard
          accessibilityLabel='Appearance'
          onPress={() => router.push("/appearance")}
          leading={
            <SymbolView
              name={{ ios: "paintpalette", android: "palette", web: "palette" }}
              size={iconSizes.card}
              tintColor={colors.primary}
            />
          }
          trailing={chevron}
        >
          <Text style={[typography.cardTitle, { color: colors.text }]}>
            Appearance
          </Text>
          <Text style={[typography.secondaryBody, { color: colors.muted }]}>
            Customize LifePilot&apos;s theme and colors
          </Text>
        </InteractiveCard>
        <InteractiveCard
          accessibilityLabel='Backup and Restore'
          onPress={() => router.push("/backup-restore")}
          leading={
            <SymbolView
              name={{ ios: "externaldrive", android: "backup", web: "backup" }}
              size={iconSizes.card}
              tintColor={colors.primary}
            />
          }
          trailing={chevron}
        >
          <Text style={[typography.cardTitle, { color: colors.text }]}>
            Backup & Restore
          </Text>
          <Text style={[typography.secondaryBody, { color: colors.muted }]}>
            Save or recover your LifePilot data
          </Text>
        </InteractiveCard>
        <InteractiveCard
          accessibilityLabel='About LifePilot'
          onPress={() => router.push("/about")}
          leading={
            <SymbolView
              name={{ ios: "info.circle", android: "info", web: "info" }}
              size={iconSizes.card}
              tintColor={colors.primary}
            />
          }
          trailing={chevron}
        >
          <Text style={[typography.cardTitle, { color: colors.text }]}>
            About LifePilot
          </Text>
          <Text style={[typography.secondaryBody, { color: colors.muted }]}>
            App information and developer
          </Text>
        </InteractiveCard>
        <Section title='Regional Preferences'>
          <InteractiveCard
            accessibilityLabel='Date Format'
            onPress={() => router.push("/date-format")}
            leading={
              <SymbolView
                name={{
                  ios: "calendar",
                  android: "calendar_month",
                  web: "calendar_month",
                }}
                size={iconSizes.card}
                tintColor={colors.primary}
              />
            }
            trailing={chevron}
          >
            <Text style={[typography.cardTitle, { color: colors.text }]}>
              Date Format
            </Text>
            <Text style={[typography.secondaryBody, { color: colors.muted }]}>
              Choose how dates appear throughout LifePilot.
            </Text>
          </InteractiveCard>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
