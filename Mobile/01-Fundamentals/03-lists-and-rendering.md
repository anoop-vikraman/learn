# 03 · Lists and rendering

Lists are where mobile apps feel fast or slow, so this is a frequent interview topic.

## 1. ScrollView vs FlatList

> **In short:** `ScrollView` renders every child immediately; `FlatList` virtualizes — only visible items exist, so use it for anything that could grow.

| | `ScrollView` | `FlatList` |
| --- | --- | --- |
| Renders | All children at once | Only what's near the viewport |
| Memory with 1,000 items | Very high; can crash | Constant |
| Use for | A form, a few cards, a settings page | Any data-driven or unbounded list |

```tsx
<ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
  <ProfileHeader />
  <SettingsSection />
</ScrollView>
```

⚠️ `style` sizes the ScrollView itself; **`contentContainerStyle`** styles the content inside it (padding, gap, `flexGrow: 1` for centring).

## 2. FlatList

> **In short:** Give it `data`, a `keyExtractor` and a `renderItem`; everything else is optimization and empty/loading states.

```tsx
import { FlatList, RefreshControl, Text, View } from 'react-native';

<FlatList
  data={tasks}
  keyExtractor={(item) => item.id}                      // stable, unique — never the index
  renderItem={({ item }) => <TaskRow task={item} />}
  ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#e2e8f0' }} />}
  ListHeaderComponent={<Filters />}
  ListFooterComponent={isFetchingMore ? <ActivityIndicator /> : null}
  ListEmptyComponent={<EmptyState message="No tasks yet" />}
  contentContainerStyle={tasks.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : { padding: 16 }}
  refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refetch} />}
  onEndReached={loadMore}
  onEndReachedThreshold={0.5}
  showsVerticalScrollIndicator={false}
/>
```

### Performance props

> **In short:** `getItemLayout`, batch sizes and window size control how much the list renders and measures.

```tsx
<FlatList
  getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}  // fixed-height rows: big win
  initialNumToRender={10}
  maxToRenderPerBatch={10}
  windowSize={5}                   // viewports rendered above+below (default 21)
  removeClippedSubviews            // Android: detach off-screen views
  numColumns={2}                   // grid (can't change at runtime without a key change)
/>
```

| Prop | Effect |
| --- | --- |
| `getItemLayout` | Skips measurement — enables instant `scrollToIndex` and smoother scrolling |
| `initialNumToRender` | Keep it to roughly one screenful for fast first paint |
| `windowSize` | Lower = less memory, more blank space while scrolling fast |
| `removeClippedSubviews` | Helps on Android; can cause glitches with complex rows |

## 3. Memoizing rows

> **In short:** Wrap row components in `React.memo` and keep their props stable, or every list re-render re-renders every visible row.

```tsx
// ❌ a new function per render → memo never helps
<FlatList renderItem={({ item }) => <TaskRow task={item} onToggle={() => toggle(item.id)} />} />

// ✅
const TaskRow = memo(function TaskRow({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
  return (
    <Pressable onPress={() => onToggle(task.id)}>
      <Text>{task.title}</Text>
    </Pressable>
  );
});

const handleToggle = useCallback((id: string) => setTasks((p) => p.map((t) => t.id === id ? { ...t, done: !t.done } : t)), []);
const renderItem = useCallback(({ item }: { item: Task }) => <TaskRow task={item} onToggle={handleToggle} />, [handleToggle]);

<FlatList data={tasks} renderItem={renderItem} keyExtractor={keyExtractor} />
```

Pass the **id** to the callback rather than creating a closure per row — that's what keeps props referentially stable.

## 4. Keys

> **In short:** `keyExtractor` must return a stable unique id; index keys break animations, selection and input state when the list changes.

```tsx
keyExtractor={(item) => item.id}                  // ✅
keyExtractor={(item, index) => String(index)}     // ⚠️ only for static lists
```

Same rule as React on the web, with a sharper edge on mobile because rows are recycled.

## 5. FlashList

> **In short:** Shopify's `@shopify/flash-list` is a drop-in replacement that recycles views and usually scrolls much better on large lists.

```bash
npx expo install @shopify/flash-list
```

```tsx
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={tasks}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <TaskRow task={item} />}
  estimatedItemSize={72}            // v1: required. v2 can infer it
/>
```

It recycles component instances, so **don't keep local state inside rows** — derive everything from props.

## 6. SectionList

> **In short:** Grouped lists with sticky headers, for things like "Today / This week / Later".

```tsx
<SectionList
  sections={[
    { title: 'Today', data: todayTasks },
    { title: 'This week', data: weekTasks },
  ]}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <TaskRow task={item} />}
  renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
  stickySectionHeadersEnabled
/>
```

## 7. Pull to refresh and infinite scroll

> **In short:** `RefreshControl` for pull-to-refresh, `onEndReached` for pagination — guard against duplicate loads.

```tsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isRefetching } = useInfiniteQuery({
  queryKey: ['tasks'],
  queryFn: ({ pageParam }) => api.getTasks({ cursor: pageParam }),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last) => last.nextCursor,
});

const tasks = data?.pages.flatMap((p) => p.items) ?? [];

<FlatList
  data={tasks}
  refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
  onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
  onEndReachedThreshold={0.5}
  ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} /> : null}
/>
```

## 8. Swipe actions and reordering

> **In short:** Use `react-native-gesture-handler`'s `Swipeable` for swipe-to-delete and `react-native-draggable-flatlist` for reordering.

```tsx
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

<ReanimatedSwipeable renderRightActions={() => <DeleteAction onPress={() => remove(task.id)} />}>
  <TaskRow task={task} />
</ReanimatedSwipeable>
```

## 9. Common list problems

> **In short:** Most list jank comes from heavy rows, unstable props, missing virtualization or oversized images.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Scrolling stutters | Heavy row renders, inline functions, big images | `memo`, `useCallback`, smaller images, `getItemLayout` |
| Blank space while scrolling fast | Virtualization can't keep up | Raise `windowSize`, use FlashList, simplify rows |
| Whole list re-renders on one change | Unstable `renderItem`/`data` identity, parent state | Memoize; keep list state out of the screen component |
| List doesn't scroll | Parent missing `flex: 1`, or nested in a ScrollView | Fix the layout; never nest a FlatList inside a vertical ScrollView |
| Keyboard dismisses on tap | Default behaviour | `keyboardShouldPersistTaps="handled"` |
| Items jump on update | Index keys | Stable `keyExtractor` |

⚠️ **Never nest a vertical `FlatList` inside a vertical `ScrollView`** — virtualization breaks. Use `ListHeaderComponent`/`ListFooterComponent` instead.

---

## 10. Exercises

1. Render 5,000 generated tasks in a `ScrollView`, then a `FlatList`; compare startup and memory.
2. Add `memo` + `useCallback` to rows and verify with the profiler that only the changed row re-renders.
3. Add `getItemLayout` for fixed-height rows and `scrollToIndex` to jump to item 500.
4. Replace `FlatList` with `FlashList` and compare scroll smoothness on a low-end device.
5. Add pull-to-refresh and cursor-based infinite scroll.
6. Add swipe-to-delete with `ReanimatedSwipeable`.
