import { AntDesign } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { API_URL } from "../config";

export default function AisleScreen() {
  const [aisles, setAisles] = useState([]); // aisles مع المنتجات
  const [unmatched, setUnmatched] = useState([]); // الفئات غير الموجودة
  const [loading, setLoading] = useState(true);
  const [categoryValues, setCategoryValues] = useState({});

  useEffect(() => {
    const fetchMatchedAisles = async () => {
      try {
        setLoading(true);

        const stored = await AsyncStorage.getItem("analyzedResults");
        if (!stored) return;

        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed) || parsed.length === 0) return;

        //  إرسال النتائج إلى السيرفر
        const { data } = await axios.post(`${API_URL}/match-aisles`, { items: parsed });

        if (data.success && data.results) {
          //  تقسيم النتائج حسب aisles
          const grouped = {};
          const notFound = [];

          data.results.forEach((item) => {
            if (item.aisle === "Not found" || !item.aisle) {
              notFound.push(item);
            } else {
              if (!grouped[item.aisle]) grouped[item.aisle] = [];
              grouped[item.aisle].push(item);
            }
          });

          // 🔹 تجهيز الممرات
          const aisleList = Object.keys(grouped).map((aisleName, i) => ({
            id: i + 1,
            name: aisleName,
            items: grouped[aisleName].map((it) => ({
              category: it.category,
              name: it.name,
              checked: true,
            })),
          }));

          setAisles(aisleList);
          setUnmatched(notFound);

          // 🔸 تهيئة الإدخالات للفئات غير المطابقة
          const initialValues = {};
          notFound.forEach((c, i) => (initialValues[i] = ""));
          setCategoryValues(initialValues);
        }
      } catch (err) {
        console.error("Error fetching aisles:", err.message);
      } finally {
        setLoading(false);
      }
    };
 
    fetchMatchedAisles();
  }, []);

  const handleCategoryChange = (id, text) => {
    setCategoryValues((prev) => ({ ...prev, [id]: text }));
  };

  const handleEdit = (aisleId, itemIndex) => {
    console.log("Edit item:", aisleId, itemIndex);
  };

  const CheckMark = () => <Text style={styles.checkMark}>✔</Text>;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={styles.loadingText}>Loading analyzed aisles...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* عرض الممرات */}
      {aisles.length > 0 ? (
        aisles.map((aisle) => (
          <View key={aisle.id} style={styles.aisleSection}>
            <View style={styles.table}>
              {/* رأس الجدول */}
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, styles.categoryCell]}>{aisle.name}</Text>
              </View>

              {/* صفوف المنتجات */}
              {aisle.items.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.cell, styles.categoryCell]}>{item.category}</Text>
                <Text style={[styles.cell, styles.nameCell]}>{item.name}</Text>

                {/*  زر أو حقل التعديل */}
                <View style={[styles.cell, styles.editCell]}>
                  {item.editing ? (
                    <TextInput
                      style={[
                        styles.input,
                        item.error ? styles.inputError : null
                      ]}
                      value={item.newAisle || ""}
                      onChangeText={(text) => {
                        const newAisles = aisles.map((a) =>
                          a.id === aisle.id
                            ? {
                                ...a,
                                items: a.items.map((it, i) =>
                                  i === index
                                    ? { ...it, newAisle: text, error: false }
                                    : it
                                ),
                              }
                            : a
                        );
                        setAisles(newAisles);
                      }}
                      placeholder="Enter new aisle"
                      placeholderTextColor="#aaa"
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => {
                        const newAisles = aisles.map((a) =>
                          a.id === aisle.id
                            ? {
                                ...a,
                                items: a.items.map((it, i) =>
                                  i === index
                                    ? { ...it, editing: true } // تفعيل وضع التعديل
                                    : it
                                ),
                              }
                            : a
                        );
                        setAisles(newAisles);
                      }}
                    >
                      <AntDesign name="edit" size={16} color="#007AFF" />
                    </TouchableOpacity>
                  )}
                </View>

                {/*  زر ✔ للتحقق */}
                <View style={[styles.cell, styles.checkCell]}>
                  <TouchableOpacity
                    onPress={async () => {
                      const targetItem = item;

                      //  الحالة الأولى: هناك حقل إدخال (editing = true)
                      if (targetItem.editing) {
                        if (!targetItem.newAisle || targetItem.newAisle.trim() === "") {
                          //  لا توجد قيمة → حقل أحمر
                          const newAisles = aisles.map((a) =>
                            a.id === aisle.id
                              ? {
                                  ...a,
                                  items: a.items.map((it, i) =>
                                    i === index
                                      ? { ...it, error: true }
                                      : it
                                  ),
                                }
                              : a
                          );
                          setAisles(newAisles);
                          return;
                        }

                        try {
                          //  تحديث في قاعدة البيانات
                          await axios.post(`${API_URL}/update-aisle`, {
                            category: targetItem.category,
                            aisle: targetItem.newAisle.trim(),
                          });

                          //  إخفاء الصف بعد التحديث
                          setAisles((prev) =>
                            prev.map((a) =>
                              a.id === aisle.id
                                ? {
                                    ...a,
                                    items: a.items.filter((_, i) => i !== index),
                                  }
                                : a
                            )
                          );
                        } catch (error) {
                          console.error(" Update failed:", error.message);
                        }
                      }

                      //  الحالة الثانية: لا يوجد حقل إدخال → إخفاء الصف مباشرة
                      else {
                        setAisles((prev) =>
                          prev.map((a) =>
                            a.id === aisle.id
                              ? {
                                  ...a,
                                  items: a.items.filter((_, i) => i !== index),
                                }
                              : a
                          )
                        );
                      }
                    }}
                  >
                    <Text style={styles.checkMark}>✔</Text>
                  </TouchableOpacity>
                </View>
              </View>

              ))}
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.noDataText}>No aisles matched.</Text>
      )}

      {/*الأصناف التي لم يُعثر على ممراتها */}
      {unmatched.length > 0 && (
        <View style={styles.categoriesSection}>
          <Text style={styles.categoriesTitle}></Text>
          <View style={styles.table}>
            {unmatched.map((category, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.cell, styles.categoryCell]}>{category.category}</Text>

                {/* حقل الإدخال */}
                <View style={[styles.cell, styles.inputCell]}>
                  <TextInput
                    style={[styles.input,categoryValues[`error_${index}`] ? styles.inputError : null]}
                    value={categoryValues[index] || ""}
                    onChangeText={(text) => {handleCategoryChange(index, text.trimStart());
                      setCategoryValues((prev) => ({...prev, [`error_${index}`]: false,}));
                    }}
                    placeholder="Enter aisle no"
                    placeholderTextColor="#aaa"
                  />
                </View>

                {/*  زر ✔ للإرسال */}
                <View style={[styles.cell, styles.checkCell]}>
                  <TouchableOpacity
                    onPress={async () => { const aisleValue = categoryValues[index];
                      if (!aisleValue || aisleValue.trim() === "") { setCategoryValues((prev) => ({...prev, [`error_${index}`]: true,}));
                        return;
                      }
                      try {
                        // إرسال البيانات إلى السيرفر
                        const response = await axios.post(`${API_URL}/add-item`, {
                          category: category.category,
                          aisle: aisleValue.trim(),
                        });

                        if (response.data.success) {
                          console.log(" Inserted:", category.category, aisleValue);

                          //  إزالة الصف من الواجهة بعد نجاح الإدخال
                          setUnmatched((prev) => prev.filter((_, i) => i !== index) );

                          // إزالة قيمته من الحقول المؤقتة
                          setCategoryValues((prev) => {
                            const updated = { ...prev };
                            delete updated[index];
                            delete updated[`error_${index}`];
                            return updated;
                          });
                        }
                      } catch (error) { console.error(" Failed to add:", error.message);}
                    }}
                  >
                    <Text style={styles.checkMark}>✔</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 10,
  },
  aisleSection: {
    marginBottom: 20,
  },
  categoriesSection: {
    marginBottom: 40,
  },
  categoriesTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    color: "#333",
  },
  table: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "white",
  },
  tableHeader: {
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerCell: {
    padding: 12,
    fontWeight: "bold",
    color: "#555",
    textAlign: "center",
  },
  cell: {
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#eee",
  },
  categoryCell: {
    flex: 1,
    textAlign: "left",
    fontWeight: "500",
    color: "#333",
  },
  nameCell: {
    flex: 2,
    textAlign: "left",
    color: "#666",
  },
  inputCell: {
    flex: 2.8,
    padding: 8,
  },
  editCell: {
    flex: 0.8,
    justifyContent: "center",
    alignItems: "center",
  },
  checkCell: {
    flex: 0.5,
    borderRightWidth: 0,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    padding: 8,
    width: "100%",
    backgroundColor: "#fafafa",
  },
  editButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: "#f0f0f0",
  },
  checkMark: {
    color: "green",
    fontSize: 16,
    fontWeight: "bold",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    color: "#555",
  },
  noDataText: {
    textAlign: "center",
    color: "#777",
    marginVertical: 10,
    fontStyle: "italic",
  },
  inputError: {
    borderColor: "#e74c3c",
  },
  checkMark: {
    color: "green",
    fontSize: 18,
    fontWeight: "bold",
  },
});