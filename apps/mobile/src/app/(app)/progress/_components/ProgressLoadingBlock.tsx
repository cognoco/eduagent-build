import { View } from 'react-native';

export function ProgressLoadingBlock(): React.ReactElement {
  return (
    <>
      <View className="bg-coaching-card rounded-card p-5">
        <View className="bg-border rounded h-7 w-2/3 mb-3" />
        <View className="bg-border rounded h-4 w-full mb-2" />
        <View className="bg-border rounded h-4 w-3/4" />
      </View>
      <View className="bg-surface rounded-card p-4 mt-4">
        <View className="bg-border rounded h-5 w-1/3 mb-4" />
        <View className="bg-border rounded h-4 w-full mb-2" />
        <View className="bg-border rounded h-4 w-2/3" />
      </View>
    </>
  );
}
