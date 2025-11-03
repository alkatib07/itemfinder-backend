import { AntDesign } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// عنوان السيرفر المحلي
const API_URL = "https://itemfinder-backend.onrender.com";

// مكون التكبير
function PinchZoomImage({ uri }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={pinch}>
      <Animated.Image
        source={{ uri }}
        style={[styles.previewImage, animatedStyle]}
        resizeMode="contain"
      />
    </GestureDetector>
  );
}

export default function Upload() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const router = useRouter();

  // ✅ إعدادات إضافية للويب
  useEffect(() => {
    if (Platform.OS === "web") {
      // تغيير لون شريط العنوان في المتصفح
      const themeColor = document.querySelector('meta[name="theme-color"]');
      if (themeColor) {
        themeColor.setAttribute('content', '#0f0f0f');
      } else {
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = '#0f0f0f';
        document.head.appendChild(meta);
      }

      // إزالة الهوامش الافتراضية
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.backgroundColor = '#0f0f0f';
      
      // منع التكبير على الهواتف
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      }
    }
  }, []);

  // ✅ اختيار الصور
  const pickImage = async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;

      input.onchange = async (event) => {
        const files = Array.from(event.target.files);
        if (!files.length) return; // ✅ إصلاح: كان Freturn

        setLoading(true);
        try {
          const newImages = [];
          for (const file of files) {
            const objectUrl = URL.createObjectURL(file);
            const id = `${file.name}-${file.size}`;
            if (!images.some((img) => img.id === id)) {
              newImages.push({
                id,
                uri: objectUrl,
                fileName: file.name,
                file,
              });
            }
          }
          setImages((prev) => [...prev, ...newImages].slice(0, 10));
        } finally {
          setLoading(false);
        }
      };

      input.click();
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow access to your photos.");
        return;
      }

      setLoading(true);
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: true,
          quality: 0.8,
        });

        if (!result.canceled && result.assets) {
          const newImages = result.assets.map((asset) => ({
            id: `${asset.uri}-${Date.now()}`,
            uri: asset.uri,
            fileName: asset.fileName || asset.uri.split("/").pop(),
          }));
          setImages((prev) => [...prev, ...newImages].slice(0, 6));
        }
      } catch (error) {
        console.error("Error picking images:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  // رفع الصور إلى السيرفر وتحليلها
  const uploadToServer = async () => {
    try {
      setLoading(true);
      const formData = new FormData();

      for (const img of images) {
        if (Platform.OS === "web" && img.file) {
          formData.append("images", img.file, img.fileName);
        } else {
          formData.append("images", {
            uri: img.uri,
            type: "image/jpeg",
            name: img.fileName || `photo_${Date.now()}.jpg`,
          });
        }
      }

      const { data } = await axios.post(`${API_URL}/analyze`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      console.log("AI Results:", data.results);

      // حفظ النتائج مؤقتًا
      await AsyncStorage.setItem("analyzedResults", JSON.stringify(data.results));

      // الانتقال إلى AisleScreen بعد التحليل
      router.push("/AisleScreen");

    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Failed to upload and analyze images.");
    } finally {
      setLoading(false);
    }
  };

  // عند الضغط على Submit
  const handleSubmit = async () => {
    if (images.length === 0) {
      Alert.alert("No Images", "Please upload at least one image before submitting.");
      return;
    }
    await uploadToServer();
  };

  // حذف صورة
  const removeImage = (id) => {
    setImages(images.filter((img) => img.id !== id));
  };

  // عرض الصور
  const renderItem = ({ item }) => (
    <View style={styles.imageWrapper}>
      <TouchableOpacity onPress={() => setPreviewImage(item.uri)}>
        <Image source={{ uri: item.uri }} style={styles.image} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => removeImage(item.id)}
      >
        <AntDesign name="close" size={14} color="#ff4444" />
      </TouchableOpacity>

    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Upload & Analyze Images</Text>

      <View style={styles.uploadBox}>
        <FlatList
          data={images.length < 10 ? [...images, { id: "add" }] : images}
          numColumns={3}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            item.id === "add" ? (
              <TouchableOpacity
                style={[styles.addButton, loading && styles.addButtonDisabled]}
                onPress={pickImage}
                disabled={loading}
              >
                {loading ? (
                  <Text style={styles.loadingText}>...</Text>
                ) : (
                  <AntDesign name="plus" size={36} color="#007BFF" />
                )}
              </TouchableOpacity>
            ) : (
              renderItem({ item })
            )
          }
        />
      </View>

      {/* نافذة تكبير الصورة */}
      <Modal
        visible={!!previewImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.modalBackground}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setPreviewImage(null)}
          >
            <AntDesign name="close" size={18} color="#000" />
          </TouchableOpacity>
          <PinchZoomImage uri={previewImage} />
        </View>
      </Modal>

      {/* زر الإرسال */}
      <TouchableOpacity
        style={[
          styles.submitButton,
          images.length === 0 && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={images.length === 0 || loading}
      >
        <Text style={styles.submitText}>
          {loading
            ? "Analyzing..."
            : images.length === 0
            ? "No Images to Submit"
            : `Submit ${images.length} Image(s)`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f0f",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    width: '100%',
    minHeight: '100vh', //  مهم للويب
  },
  title: {
    fontSize: 22,
    color: "#fff",
    fontWeight: "600",
    marginBottom: 20,
  },
  uploadBox: {
    width: "90%",
    maxWidth: 600,
    minHeight: 300,
    backgroundColor: "#1b1b1b",
    borderRadius: 20,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    width: 100,
    height: 100,
    backgroundColor: "#252525",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    margin: 8,
    borderWidth: 1.5,
    borderColor: "#007BFF",
    borderStyle: "dashed",
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  loadingText: {
    color: "#007BFF",
    fontSize: 24,
    fontWeight: "bold",
  },
  imageWrapper: {
    position: "relative",
    margin: 8,
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 15,
  },
  deleteButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#1b1b1b",
    borderRadius: 50,
    padding: 1,
  },
  submitButton: {
    marginTop: 30,
    backgroundColor: "#007BFF",
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 80,
  },
  submitButtonDisabled: {
    backgroundColor: "#666",
  },
  submitText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "90%",
    height: "80%",
    borderRadius: 10,
  },
  closeButton: {
    position: "absolute",
    backgroundColor: "#fff", // ✅ خلفية بيضاء
    top: 50,
    right: 30,
    zIndex: 2,
  },
});