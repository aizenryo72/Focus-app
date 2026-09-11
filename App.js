import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';

// --- GLOBAL STORAGE KEYS ---
const TASKS_KEY = '@daily_tasks';
const HISTORY_KEY = '@survey_history';
const ALARM_URI_KEY = '@alarm_uri';

// --- MAIN APP COMPONENT ---
export default function App() {
  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState([]);
  const [customAlarmUri, setCustomAlarmUri] = useState(null);

  // Modals State
  const [activeAlarmTask, setActiveAlarmTask] = useState(null);
  const [showSurvey, setShowSurvey] = useState(false);
  
  // Audio State
  const [soundObject, setSoundObject] = useState(null);
  const [alarmVolume, setAlarmVolume] = useState(1.0);

  // Load Offline Data on Start
  useEffect(() => {
    loadOfflineData();
    const interval = setInterval(checkTimeTriggers, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadOfflineData = async () => {
    try {
      const savedTasks = await AsyncStorage.getItem(TASKS_KEY);
      const savedHistory = await AsyncStorage.getItem(HISTORY_KEY);
      const savedUri = await AsyncStorage.getItem(ALARM_URI_KEY);
      if (savedTasks) setTasks(JSON.parse(savedTasks));
      if (savedHistory) setHistory(JSON.parse(savedHistory));
      if (savedUri) setCustomAlarmUri(savedUri);
    } catch (e) {
      console.log('Failed to load data', e);
    }
  };

  const saveData = async (key, data) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.log('Failed to save', e);
    }
  };

  // Trigger Logic (Alarms & Survey)
  const checkTimeTriggers = () => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Check for 9:30 PM Survey
    if (currentTime === '21:30' && !showSurvey) {
      setShowSurvey(true);
    }

    // Check for Task Deadlines
    tasks.forEach(task => {
      if (task.time === currentTime && !task.completed && !task.alarmTriggered) {
        triggerAlarm(task);
        // Mark as triggered to avoid looping
        const updatedTasks = tasks.map(t => t.id === task.id ? { ...t, alarmTriggered: true } : t);
        setTasks(updatedTasks);
        saveData(TASKS_KEY, updatedTasks);
      }
    });
  };

  // Alarm Execution
  const triggerAlarm = async (task) => {
    setActiveAlarmTask(task);
    try {
      const { sound } = await Audio.Sound.createAsync(
        customAlarmUri ? { uri: customAlarmUri } : require('./assets/snack-icon.png') // Fallback required in snack, ideally a default tone
      );
      setSoundObject(sound);
      await sound.setVolumeAsync(alarmVolume);
      await sound.setIsLoopingAsync(true);
      await sound.playAsync();
    } catch (error) {
      console.log("Audio play error (expected in basic Snack without real asset)", error);
    }
  };

  const stopAlarm = async () => {
    if (soundObject) {
      await soundObject.stopAsync();
      await soundObject.unloadAsync();
      setSoundObject(null);
    }
    setActiveAlarmTask(null);
  };

  const changeAlarmVolume = async (increase) => {
    let newVol = increase ? Math.min(alarmVolume + 0.2, 1.0) : Math.max(alarmVolume - 0.2, 0.0);
    setAlarmVolume(newVol);
    if (soundObject) {
      await soundObject.setVolumeAsync(newVol);
    }
  };

  // --- SCREENS ---
  
  // 1. HOME SCREEN (Tasks & Regain Meter)
  const HomeScreen = () => {
    const [taskName, setTaskName] = useState('');
    const [taskTime, setTaskTime] = useState(''); // Format HH:MM

    const addTask = () => {
      if (!taskName || !taskTime) return;
      const newTask = { id: Date.now().toString(), name: taskName, time: taskTime, completed: false, alarmTriggered: false };
      const updatedTasks = [...tasks, newTask];
      setTasks(updatedTasks);
      saveData(TASKS_KEY, updatedTasks);
      setTaskName('');
      setTaskTime('');
    };

    const toggleTask = (id) => {
      const updatedTasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
      setTasks(updatedTasks);
      saveData(TASKS_KEY, updatedTasks);
    };

    const completedCount = tasks.filter(t => t.completed).length;
    const progress = tasks.length === 0 ? 0 : (completedCount / tasks.length) * 100;

    return (
      <View style={styles.container}>
        <View style={styles.meterContainer}>
          <Text style={styles.header}>Daily Regain Meter</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.meterText}>{completedCount} of {tasks.length} Targets Completed</Text>
        </View>

        <View style={styles.inputContainer}>
          <TextInput style={styles.input} placeholder="Task Name..." placeholderTextColor="#888" value={taskName} onChangeText={setTaskName} />
          <TextInput style={styles.input} placeholder="Time (HH:MM 24h format)" placeholderTextColor="#888" value={taskTime} onChangeText={setTaskTime} keyboardType="numbers-and-punctuation" />
          <TouchableOpacity style={styles.btnMain} onPress={addTask}><Text style={styles.btnText}>Add Target</Text></TouchableOpacity>
        </View>

        <ScrollView style={styles.taskList}>
          {tasks.map(task => (
            <TouchableOpacity key={task.id} style={[styles.taskItem, task.completed && styles.taskCompleted]} onPress={() => toggleTask(task.id)}>
              <Text style={styles.taskTitle}>{task.name}</Text>
              <Text style={styles.taskTime}>{task.time}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  // 2. HISTORY SCREEN
  const HistoryScreen = () => (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Journal History</Text>
      {history.slice().reverse().map((entry, index) => (
        <View key={index} style={styles.historyCard}>
          <Text style={styles.historyDate}>{entry.date}</Text>
          <Text style={styles.historyText}>Rating: {entry.rating}/10</Text>
          <Text style={styles.historyText}>Missed: {entry.missed}</Text>
          <Text style={styles.historyText}>Tomorrow: {entry.tomorrow}</Text>
        </View>
      ))}
    </ScrollView>
  );

  // 3. SETTINGS SCREEN
  const SettingsScreen = () => {
    const pickAudio = async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
        if (result.type === 'success') {
          setCustomAlarmUri(result.uri);
          await AsyncStorage.setItem(ALARM_URI_KEY, result.uri);
          Alert.alert("Success", "Custom alarm tone loaded from storage!");
        }
      } catch (err) {
        console.log(err);
      }
    };

    return (
      <View style={styles.container}>
        <Text style={styles.header}>App Configuration</Text>
        <View style={styles.settingsCard}>
          <Text style={styles.settingsLabel}>Custom Alarm Sound</Text>
          <Text style={styles.settingsSub}>{customAlarmUri ? "Custom tone active" : "Default tone active"}</Text>
          <TouchableOpacity style={styles.btnSecondary} onPress={pickAudio}>
            <Text style={styles.btnText}>Choose from Storage</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowSurvey(true)}>
          <Text style={styles.btnText}>Test Night Survey Now</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // --- TAB NAVIGATION ---
  const Tab = createBottomTabNavigator();

  return (
    <NavigationContainer theme={DarkTheme}>
      <Tab.Navigator screenOptions={{ tabBarStyle: { backgroundColor: '#1e1e1e' }, headerStyle: { backgroundColor: '#1e1e1e' }, headerTintColor: '#fff', tabBarActiveTintColor: '#00e676' }}>
        <Tab.Screen name="Dashboard" children={() => <HomeScreen />} />
        <Tab.Screen name="History" children={() => <HistoryScreen />} />
        <Tab.Screen name="Settings" children={() => <SettingsScreen />} />
      </Tab.Navigator>

      {/* FULL-SCREEN ALARM MODAL */}
      <Modal visible={!!activeAlarmTask} animationType="slide" transparent={false}>
        <View style={[styles.container, styles.modalCenter]}>
          <Text style={styles.alarmWarning}>DEADLINE REACHED!</Text>
          <Text style={styles.alarmTitle}>{activeAlarmTask?.name}</Text>
          
          <View style={styles.volumeControls}>
            <Text style={styles.volumeLabel}>Alarm Volume: {Math.round(alarmVolume * 100)}%</Text>
            <View style={styles.volumeButtonsRow}>
              <TouchableOpacity style={styles.volBtn} onPress={() => changeAlarmVolume(false)}><Text style={styles.volBtnText}>-</Text></TouchableOpacity>
              <TouchableOpacity style={styles.volBtn} onPress={() => changeAlarmVolume(true)}><Text style={styles.volBtnText}>+</Text></TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.stopBtn} onPress={stopAlarm}>
            <Text style={styles.stopBtnText}>COMPLETE & STOP ALARM</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* NIGHT SURVEY MODAL */}
      <Modal visible={showSurvey} animationType="slide" transparent={false}>
        <SurveyComponent 
          onClose={(data) => {
            if (data) {
              const newHistory = [...history, { ...data, date: new Date().toDateString() }];
              setHistory(newHistory);
              saveData(HISTORY_KEY, newHistory);
            }
            setShowSurvey(false);
          }} 
        />
      </Modal>
    </NavigationContainer>
  );
}

// --- SURVEY COMPONENT ---
const SurveyComponent = ({ onClose }) => {
  const [rating, setRating] = useState('5');
  const [missed, setMissed] = useState('');
  const [tomorrow, setTomorrow] = useState('');

  const submitSurvey = () => {
    onClose({ rating, missed, tomorrow });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Nightly Journal Survey</Text>
      
      <Text style={styles.label}>Rate your day (1-10): {rating}</Text>
      <View style={styles.volumeButtonsRow}>
        <TouchableOpacity style={styles.volBtn} onPress={() => setRating(r => Math.max(1, parseInt(r)-1).toString())}><Text style={styles.volBtnText}>-</Text></TouchableOpacity>
        <TouchableOpacity style={styles.volBtn} onPress={() => setRating(r => Math.min(10, parseInt(r)+1).toString())}><Text style={styles.volBtnText}>+</Text></TouchableOpacity>
      </View>

      <Text style={styles.label}>What targets did you miss & why?</Text>
      <TextInput style={styles.textArea} multiline value={missed} onChangeText={setMissed} placeholder="Enter reasons..." placeholderTextColor="#555" />

      <Text style={styles.label}>Tomorrow's main focus?</Text>
      <TextInput style={styles.textArea} multiline value={tomorrow} onChangeText={setTomorrow} placeholder="Enter focus..." placeholderTextColor="#555" />

      <TouchableOpacity style={styles.btnMain} onPress={submitSurvey}>
        <Text style={styles.btnText}>Save & Sleep</Text>
      </TouchableOpacity>
    </View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20 },
  modalCenter: { justifyContent: 'center', alignItems: 'center' },
  header: { color: '#00e676', fontSize: 24, fontWeight: 'bold', marginBottom: 20, marginTop: 40 },
  label: { color: '#fff', fontSize: 16, marginTop: 20, marginBottom: 10 },
  meterContainer: { marginBottom: 30, alignItems: 'center' },
  progressBarBg: { width: '100%', height: 20, backgroundColor: '#333', borderRadius: 10, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#00e676' },
  meterText: { color: '#aaa', marginTop: 10 },
  inputContainer: { marginBottom: 20 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  textArea: { backgroundColor: '#1e1e1e', color: '#fff', padding: 15, borderRadius: 10, height: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#333' },
  btnMain: { backgroundColor: '#00e676', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  btnSecondary: { backgroundColor: '#333', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  taskList: { flex: 1 },
  taskItem: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', borderLeftWidth: 5, borderLeftColor: '#ff5252' },
  taskCompleted: { borderLeftColor: '#00e676', opacity: 0.6 },
  taskTitle: { color: '#fff', fontSize: 16 },
  taskTime: { color: '#aaa' },
  historyCard: { backgroundColor: '#1e1e1e', padding: 15, borderRadius: 10, marginBottom: 15 },
  historyDate: { color: '#00e676', fontWeight: 'bold', marginBottom: 5 },
  historyText: { color: '#ccc', marginBottom: 3 },
  settingsCard: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 10 },
  settingsLabel: { color: '#fff', fontSize: 18 },
  settingsSub: { color: '#aaa', marginTop: 5 },
  alarmWarning: { color: '#ff5252', fontSize: 28, fontWeight: 'bold' },
  alarmTitle: { color: '#fff', fontSize: 22, marginVertical: 20 },
  volumeControls: { width: '100%', alignItems: 'center', marginVertical: 30, backgroundColor: '#1e1e1e', padding: 20, borderRadius: 10 },
  volumeLabel: { color: '#aaa', fontSize: 16, marginBottom: 15 },
  volumeButtonsRow: { flexDirection: 'row', justifyContent: 'space-evenly', width: '100%' },
  volBtn: { backgroundColor: '#333', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  volBtnText: { color: '#fff', fontSize: 30 },
  stopBtn: { backgroundColor: '#ff5252', padding: 20, borderRadius: 10, width: '100%', alignItems: 'center', marginTop: 30 },
  stopBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 }
});
  
