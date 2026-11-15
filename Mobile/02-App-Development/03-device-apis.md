# 03 · Device APIs

## 1. Permissions

> **In short:** Every sensitive capability needs runtime permission plus a purpose string in app config — ask in context, handle denial, and offer a route to Settings.

```tsx
import { Camera } from 'expo-camera';
import { Linking, Alert } from 'react-native';

const [permission, requestPermission] = Camera.useCameraPermissions();

async function openCamera() {
  if (!permission?.granted) {
    const result = await requestPermission();
    if (!result.granted) {
      if (!result.canAskAgain) {                       // permanently denied
        Alert.alert('Camera access needed', 'Enable camera access in Settings to attach photos.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      }
      return;
    }
  }
  setCameraOpen(true);
}
```

```json
// app.json — purpose strings are required (iOS rejects missing ones)
"plugins": [
  ["expo-camera", { "cameraPermission": "Attach photos to your tasks." }],
  ["expo-location", { "locationAlwaysAndWhenInUsePermission": "Show tasks near your current location." }],
  ["expo-image-picker", { "photosPermission": "Choose a photo to attach to a task." }]
]
```

The permission states you must handle: `granted`, `denied` (can ask again), `denied` + `canAskAgain: false` (Settings only), and `undetermined`.

## 2. Camera and image picker

> **In short:** `expo-image-picker` for "choose or take a photo" (simplest, no permission needed for the iOS picker), `expo-camera` when you need a custom camera UI.

```tsx
import * as ImagePicker from 'expo-image-picker';

const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [4, 3],
  quality: 0.7,                                 // ⚠️ compress: full-res phone photos are 5–12 MB
  allowsMultipleSelection: true,
  selectionLimit: 5,
});
if (!result.canceled) setPhotos(result.assets);

const photo = await ImagePicker.launchCameraAsync({ quality: 0.7 });
```

```tsx
// Custom camera
import { CameraView, useCameraPermissions } from 'expo-camera';

<CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
  <Pressable onPress={async () => {
    const pic = await cameraRef.current?.takePictureAsync({ quality: 0.7, skipProcessing: true });
    setPhoto(pic?.uri);
  }} />
</CameraView>
```

Before uploading, resize with `expo-image-manipulator`:

```ts
import * as ImageManipulator from 'expo-image-manipulator';
const resized = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1080 } }],
  { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
```

Upload to object storage with a **presigned URL** from your backend rather than routing large files through your API.

## 3. Location and maps

> **In short:** Request foreground location when the user needs it, and treat background location as a last resort — it's heavily scrutinised by both stores.

```ts
import * as Location from 'expo-location';

const { status } = await Location.requestForegroundPermissionsAsync();
if (status !== 'granted') return;

const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
const { latitude, longitude } = position.coords;

const watcher = await Location.watchPositionAsync(
  { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 10_000 },
  (pos) => setPosition(pos.coords),
);
watcher.remove();                               // ⚠️ always stop watching: it drains battery

const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
```

Maps: `react-native-maps` (Google/Apple Maps) or `@rnmapbox/maps`. Both need a development build and API keys configured through a config plugin.

Battery discipline: use the **lowest accuracy** that works, the largest acceptable interval, and stop updates when the screen isn't visible.

## 4. Files and sharing

> **In short:** `expo-file-system` reads and writes app storage, `expo-document-picker` picks files, and `expo-sharing` opens the native share sheet.

```ts
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const path = `${FileSystem.documentDirectory}report.csv`;   // documentDirectory: persists & is backed up
await FileSystem.writeAsStringAsync(path, csv);
const info = await FileSystem.getInfoAsync(path);

const { uri } = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}invoice.pdf`);
if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);

const doc = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
```

| Directory | Persists | Backed up | Use |
| --- | --- | --- | --- |
| `documentDirectory` | ✅ | ✅ | User data you must keep |
| `cacheDirectory` | ✅ until the OS reclaims space | ❌ | Downloads, thumbnails, temp files |

Clean up the cache yourself — apps have been rejected for unbounded storage growth.

## 5. Push notifications

> **In short:** Ask permission, get a push token, send it to your backend, and handle notifications in three states: foreground, background tap, and cold start from a tap.

```bash
npx expo install expo-notifications expo-device
```

```ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerForPush() {
  if (!Device.isDevice) return null;                        // ⚠️ push doesn't work in simulators

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Task reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === 'granted' ? { status: existing } : await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.registerDevice({ token, platform: Platform.OS });
  return token;
}
```

```tsx
// Handling taps and foreground notifications
useEffect(() => {
  const received = Notifications.addNotificationReceivedListener((n) => { /* app is open */ });
  const responded = Notifications.addNotificationResponseReceivedListener((r) => {
    const taskId = r.notification.request.content.data?.taskId;
    if (taskId) router.push(`/tasks/${taskId}`);            // deep link from a tap
  });
  return () => { received.remove(); responded.remove(); };
}, []);

// Cold start: the app was launched by tapping a notification
const last = Notifications.useLastNotificationResponse();
```

```ts
// Local (scheduled) notification — no server needed
await Notifications.scheduleNotificationAsync({
  content: { title: 'Task due', body: task.title, data: { taskId: task.id } },
  trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: task.dueDate },
});
```

Delivery paths: **Expo Push Service** (simplest — one API for both platforms) or **FCM/APNs directly** (more control). Either way, the token can change, so refresh it on launch and remove stale tokens server-side.

## 6. Haptics, sensors and the clipboard

> **In short:** Small native touches make an app feel native — haptics on actions, sensors where relevant, clipboard for copy buttons.

```ts
import * as Haptics from 'expo-haptics';
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);                 // button press
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);    // completed action

import * as Clipboard from 'expo-clipboard';
await Clipboard.setStringAsync(code);

import { Accelerometer } from 'expo-sensors';
const sub = Accelerometer.addListener(({ x, y, z }) => { /* … */ });
Accelerometer.setUpdateInterval(200);
sub.remove();                                                            // always unsubscribe
```

Others: `expo-battery`, `expo-brightness`, `expo-screen-orientation`, `expo-keep-awake`, `expo-av`/`expo-audio` and `expo-video` for media, `expo-barcode-scanner` (now part of `expo-camera`).

## 7. Background work

> **In short:** Mobile OSes heavily restrict background execution — use the dedicated APIs for periodic fetch, location and tasks, and never assume code runs when the app is closed.

```ts
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';

TaskManager.defineTask('SYNC_TASKS', async () => {
  await syncPendingMutations();
  return BackgroundTask.BackgroundTaskResult.Success;
});

await BackgroundTask.registerTaskAsync('SYNC_TASKS', { minimumInterval: 15 * 60 });   // minutes; OS decides
```

Reality check: iOS may run your background task rarely or never depending on user behaviour and battery; Android has Doze mode. Design so the app still works if background sync never happens — sync on foreground too.

## 8. App state and lifecycle

> **In short:** React to foreground/background transitions to refresh data, pause timers, and lock sensitive screens.

```tsx
import { AppState } from 'react-native';

useEffect(() => {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') refetch();              // returned to the app
    if (state === 'background') lockSensitiveUI();  // app switcher privacy
  });
  return () => sub.remove();
}, []);
```

## 9. Choosing and adding libraries

> **In short:** Prefer Expo's own modules, check New Architecture support, and remember anything with native code needs a development build.

Checklist before adding a native library:
- Does an `expo-*` module already do it?
- Is it maintained, and does it support the **New Architecture**?
- Is there a **config plugin**, or does it need manual native changes?
- Does it work on both platforms, and does it increase app size much?
- Does it force a permission you'd rather avoid?

---

## 10. Exercises

1. Add photo attachments: pick or capture, resize, upload via a presigned URL, show a thumbnail.
2. Handle a permanently-denied camera permission with a Settings link.
3. Register for push notifications, send one from the Expo push tool, and deep link to a task from the tap.
4. Schedule a local reminder for a task's due date and cancel it when the task is completed.
5. Add haptic feedback for completing a task and for a failed save.
6. Add `AppState` handling that refetches on foreground and hides sensitive content in the app switcher.
