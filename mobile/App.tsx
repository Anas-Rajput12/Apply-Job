import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";

import { API_BASE_URL } from "./src/config";
import { api, apiAuth } from "./src/api";

export default function App() {
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");

  const [analysis, setAnalysis] = useState<any>(null);
  const [letter, setLetter] = useState("");
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("token").then((value) => {
      if (value) setToken(value);
    });
  }, []);

  async function authenticate() {
    try {
      setLoading(true);

      const result = await api(
        `/api/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password
          })
        }
      );

      await AsyncStorage.setItem(
        "token",
        result.access_token
      );

      setToken(result.access_token);
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadCV() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    const file = result.assets[0];

    console.log("SELECTED FILE:", file);

    try {
      setLoading(true);

      const form = new FormData();

      // Expo Web
      if (file.base64) {
        const response = await fetch(file.base64);
        const blob = await response.blob();

        form.append(
          "file",
          new File(
            [blob],
            file.name || "resume.pdf",
            {
              type: file.mimeType || "application/pdf",
            }
          )
        );
      } else {
        // Native Android / iOS
        form.append("file", {
          uri: file.uri,
          name: file.name || "resume.pdf",
          type: file.mimeType || "application/pdf",
        } as any);
      }

      console.log(
        "Uploading to:",
        `${API_BASE_URL}/api/resume/upload`
      );

      const response = await fetch(
        `${API_BASE_URL}/api/resume/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        }
      );

      const responseText = await response.text();

      console.log("UPLOAD STATUS:", response.status);
      console.log("UPLOAD RESPONSE:", responseText);

      let data: any;

      try {
        data = JSON.parse(responseText);
      } catch {
        data = { detail: responseText };
      }

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail, null, 2);

        throw new Error(
          `HTTP ${response.status}: ${detail}`
        );
      }

      setResume(data.text);

      Alert.alert(
        "CV Uploaded",
        "Your PDF text was extracted successfully."
      );
    } catch (error: any) {
      console.log("UPLOAD ERROR:", error);

      Alert.alert(
        "Upload Error",
        error.message || "CV upload failed"
      );
    } finally {
      setLoading(false);
    }
  }

  async function analyzeJob() {
    if (!resume.trim()) {
      Alert.alert("CV required", "Upload or paste your CV first.");
      return;
    }

    if (!job.trim()) {
      Alert.alert(
        "Job description required",
        "Paste the job description first."
      );
      return;
    }

    try {
      setLoading(true);

      const result = await apiAuth(
        "/api/jobs/analyze",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            resume_text: resume,
            job_description: job,
            title,
            company
          })
        }
      );

      setAnalysis(result);
    } catch (error: any) {
      Alert.alert("Analysis Error", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateCoverLetter() {
    try {
      setLoading(true);

      const result = await apiAuth(
        "/api/jobs/cover-letter",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            resume_text: resume,
            job_description: job,
            title,
            company
          })
        }
      );

      setLetter(result.cover_letter);
    } catch (error: any) {
      Alert.alert("AI Error", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveApplication() {
    try {
      await apiAuth(
        "/api/applications",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            job_title: title,
            company,
            match_score: analysis?.match_score || 0,
            status: "SAVED",
            cover_letter: letter
          })
        }
      );

      Alert.alert(
        "Saved",
        "Application added to your tracker."
      );

      loadApplications();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }

  async function loadApplications() {
    try {
      const data = await apiAuth(
        "/api/applications",
        token
      );

      setApplications(data);
    } catch {
      // User can retry with the refresh button.
    }
  }

  async function logout() {
    await AsyncStorage.removeItem("token");
    setToken("");
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authCard}>
          <Text style={styles.logo}>ApplyAI</Text>

          <Text style={styles.subtitle}>
            Your AI Job Application Agent
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Button
            title={
              loading
                ? "Please wait..."
                : mode === "login"
                ? "Login"
                : "Create Account"
            }
            onPress={authenticate}
          />

          <Pressable
            onPress={() =>
              setMode(
                mode === "login"
                  ? "register"
                  : "login"
              )
            }
          >
            <Text style={styles.link}>
              {mode === "login"
                ? "Create a new account"
                : "Already have an account? Login"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>ApplyAI</Text>
            <Text style={styles.subtitle}>
              AI Job Application Agent
            </Text>
          </View>

          <Pressable onPress={logout}>
            <Text style={styles.logout}>
              Logout
            </Text>
          </Pressable>
        </View>

        <Card title="1. My CV">
          <Button
            title="Upload PDF CV"
            onPress={uploadCV}
          />

          <TextInput
            style={[
              styles.input,
              styles.textarea
            ]}
            multiline
            placeholder="Or paste your CV text here..."
            value={resume}
            onChangeText={setResume}
          />
        </Card>

        <Card title="2. Job Details">
          <TextInput
            style={styles.input}
            placeholder="Job title"
            value={title}
            onChangeText={setTitle}
          />

          <TextInput
            style={styles.input}
            placeholder="Company"
            value={company}
            onChangeText={setCompany}
          />

          <TextInput
            style={[
              styles.input,
              styles.textarea
            ]}
            multiline
            placeholder="Paste complete job description..."
            value={job}
            onChangeText={setJob}
          />

          <Button
            title="Analyze Job Match"
            onPress={analyzeJob}
          />
        </Card>

        {loading && (
          <ActivityIndicator
            size="large"
            style={{ marginBottom: 16 }}
          />
        )}

        {analysis && (
          <Card title="3. AI Analysis">
            <Text style={styles.score}>
              {analysis.match_score}%
            </Text>

            <Text style={styles.center}>
              Match Score
            </Text>

            <Text style={styles.recommend}>
              {analysis.recommendation}
            </Text>

            <Label
              title="Matched Skills"
              items={analysis.matched_skills}
            />

            <Label
              title="Missing Skills"
              items={analysis.missing_skills}
            />

            <Label
              title="ATS Keywords"
              items={analysis.ats_keywords}
            />

            <Button
              title="Generate Cover Letter"
              onPress={generateCoverLetter}
            />

            <Button
              title="Save Application"
              onPress={saveApplication}
            />
          </Card>
        )}

        {letter && (
          <Card title="4. Cover Letter">
            <Text style={styles.body}>
              {letter}
            </Text>
          </Card>
        )}

        <Card title="5. Application Tracker">
          <Button
            title="Refresh Applications"
            onPress={loadApplications}
          />

          {applications.map((item) => (
            <View
              key={item.id}
              style={styles.row}
            >
              <Text style={styles.appTitle}>
                {item.job_title || "Untitled Job"}
              </Text>

              <Text>
                {item.company || "Company"} •{" "}
                {item.status}
              </Text>

              <Text>
                Match: {item.match_score}%
              </Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Label({
  title,
  items
}: {
  title: string;
  items: string[];
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>
        {title}
      </Text>

      <Text style={styles.body}>
        {items?.length
          ? items.join(" • ")
          : "None detected"}
      </Text>
    </View>
  );
}

function Button({
  title,
  onPress
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },

  content: {
    padding: 18,
    paddingBottom: 60
  },

  authCard: {
    margin: 20,
    marginTop: 100,
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 18
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18
  },

  logo: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827"
  },

  subtitle: {
    color: "#6b7280",
    marginTop: 2
  },

  logout: {
    color: "#dc2626",
    fontWeight: "700"
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16
  },

  cardTitle: {
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 12,
    color: "#111827"
  },

  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff"
  },

  textarea: {
    minHeight: 120,
    textAlignVertical: "top"
  },

  button: {
    backgroundColor: "#111827",
    padding: 13,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700"
  },

  link: {
    textAlign: "center",
    marginTop: 8,
    color: "#2563eb",
    fontWeight: "600"
  },

  score: {
    fontSize: 46,
    fontWeight: "900",
    textAlign: "center"
  },

  center: {
    textAlign: "center",
    color: "#6b7280"
  },

  recommend: {
    textAlign: "center",
    fontWeight: "800",
    marginVertical: 14
  },

  label: {
    fontWeight: "800",
    marginBottom: 4
  },

  body: {
    lineHeight: 21,
    color: "#374151"
  },

  row: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingVertical: 12
  },

  appTitle: {
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 3
  }
});
