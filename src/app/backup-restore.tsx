import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Directory, File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { Button } from '@/components/ui/button';
import { StandardCard, StatusCard } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Section } from '@/components/ui/section';
import { layout, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { createBackup, type BackupResult } from '@/features/backup/backup-service';
import { inspectRestore } from '@/features/backup/restore-service';
import { useRestoreCoordinator } from '@/features/backup/restore-coordinator';

const message=(e:unknown)=>e instanceof Error?e.message:'Please try again.';
const size=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(1)} MB`;
export default function BackupRestoreScreen(){
 const db=useSQLiteContext(),{colors}=useAppearance(),coordinator=useRestoreCoordinator();
 const [busy,setBusy]=useState<'backup'|'restore'|null>(null),[created,setCreated]=useState<BackupResult|null>(null);
 const backup=async()=>{if(busy)return;setBusy('backup');try{setCreated(await createBackup(db));}catch(e){Alert.alert('Backup not created',message(e));}finally{setBusy(null)}};
 const save=async()=>{if(!created||busy)return;setBusy('backup');try{const directory=await Directory.pickDirectoryAsync();const target=directory.createFile(created.file.name,'application/octet-stream');await created.file.copy(target,{overwrite:true});Alert.alert('Backup saved','Your LifePilot backup was saved to the selected location.');}catch(e){Alert.alert('Backup not saved',message(e));}finally{setBusy(null)}};
 const select=async()=>{if(busy)return;setBusy('restore');try{const picked=await File.pickFileAsync({mimeTypes:['application/octet-stream','application/json','*/*']});if(picked.canceled){setBusy(null);return}const info=await inspectRestore(picked.result);Alert.alert('Replace current LifePilot data?',`Created: ${new Date(info.createdAt).toLocaleString()}\nLifePilot: ${info.appVersion}\nDatabase: ${info.compatibility === 'current'?'Compatible':'Compatible — upgrade required'}\nFiles: ${info.persistentFileCount}\nData size: ${size(info.approximateBytes)}\n\nRestoring this backup will replace the current LifePilot data on this device.`,[{text:'Cancel',style:'cancel',onPress:()=>setBusy(null)},{text:'Restore Backup',style:'destructive',onPress:()=>{void coordinator.runRestore(picked.result).catch(()=>setBusy(null));}}]);}catch(e){setBusy(null);Alert.alert('Backup cannot be restored',message(e));}};
 return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:colors.background}}><ScreenHeader title="Backup & Restore" fallbackHref="/settings"/><ScrollView contentContainerStyle={layout.screenContent}>
  <Text style={[typography.body,{color:colors.muted}]}>Keep a copy of your LifePilot data so you can move it to another phone or recover your data.</Text>
  <StandardCard><Section title="Backup" subtitle="Includes vehicles, personal expenses, tasks, service and coverage history, photos and supported attachments."><Button label="Create Backup" loading={busy==='backup'} disabled={busy!==null} onPress={()=>void backup()} icon={<SymbolView name={{ios:'archivebox',android:'backup',web:'backup'}} size={20} tintColor={colors.onPrimary}/>} /></Section></StandardCard>
  {created&&<StatusCard tone="success"><View style={{gap:spacing.sm}}><Text style={[typography.cardTitle,{color:colors.text}]}>Backup created</Text><Text style={[typography.secondaryBody,{color:colors.muted}]}>{new Date(created.manifest.createdAt).toLocaleString()} · {size(created.file.size)}</Text><Button label="Save Backup" variant="secondary" disabled={busy!==null} onPress={()=>void save()}/></View></StatusCard>}
  <StandardCard><Section title="Restore" subtitle="Select a LifePilot backup to inspect it before deciding whether to replace this device's data."><Button label="Restore Backup" variant="secondary" loading={busy==='restore'} disabled={busy!==null} onPress={()=>void select()}/></Section></StandardCard>
  {coordinator.lastError&&<Text accessibilityRole="alert" style={[typography.secondaryBody,{color:colors.danger}]}>{coordinator.lastError}</Text>}
  <Text style={[typography.caption,{color:colors.muted}]}>Large photo libraries can require significant memory. Keep LifePilot open while creating or restoring a backup.</Text>
 </ScrollView></SafeAreaView>;
}
