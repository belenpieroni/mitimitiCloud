import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, 
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image,
  Modal, Pressable 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser, resetPassword } from '../services/authService';
import { registrarTokenDispositivo, isExpoGoAndroid } from '../services/notificationsService';

// Valida que sea estrictamente formato usuario@gmail.com
const isValidEmail = (val) => {
  if (!val) return false;
  // Expresión regular estándar: texto + @ + dominio + . + extensión de al menos 2 letras
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(val.trim());
};

export default function LoginScreen() {
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [secureText, setSecureText] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Estado para modal de restablecer contraseña
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [resetSecureText, setResetSecureText] = useState(true);
  const [resetLoading, setResetLoading] = useState(false);

  // Validaciones en tiempo real
  const isEmailValid = isValidEmail(email);
  const isEmailError = email.length > 0 && !isEmailValid;

  const isPasswordValid = activeTab === 'register' ? password.length >= 8 : password.length > 0;
  const isPasswordError = activeTab === 'register' && password.length > 0 && password.length < 8;

  const isNameValid = activeTab === 'register' ? name.trim().length > 0 : true;

  // Validaciones del modal de restablecimiento
  const isResetEmailValid = isValidEmail(resetEmail);
  const isResetPasswordValid = resetPasswordVal.length >= 8;
  const isResetFormValid = isResetEmailValid && isResetPasswordValid;

  // El botón solo se activa si todo cumple las reglas
  const isFormValid = isEmailValid && isPasswordValid && isNameValid;

  const handleResetPassword = async () => {
    if (!isResetFormValid) return;

    setResetLoading(true);
    try {
      await resetPassword({
        email: resetEmail.trim().toLowerCase(),
        password: resetPasswordVal,
      });

      Alert.alert(
        '¡Contraseña actualizada!',
        'Tu contraseña ha sido restablecida exitosamente. Ya podés iniciar sesión con tu nueva clave.',
        [
          {
            text: 'Iniciar sesión',
            onPress: () => {
              setResetModalVisible(false);
              setEmail(resetEmail.trim().toLowerCase());
              setPassword('');
              setActiveTab('login');
            },
          },
        ]
      );
    } catch (error) {
      const errorMsg = error.message || 'No se pudo restablecer la contraseña';
      Alert.alert('Error al restablecer', errorMsg);
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;

    setLoading(true);
    try {
      if (activeTab === 'register') {
        await registerUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        });

        Alert.alert('¡Éxito!', 'Cuenta creada. Ahora iniciá sesión.');
        
        setActiveTab('login');
        setName('');
        setEmail('');
        setPassword('');
      } else {
        const authData = await loginUser({
          email: email.trim().toLowerCase(),
          password,
        });

        login({
          user: authData.user,
          token: authData.token,
        });

        if (!isExpoGoAndroid()) {
          try {
            await registrarTokenDispositivo(authData.token);
          } catch (pushError) {
            console.warn('[push] No se pudo registrar token de dispositivo:', pushError.message);
          }
        } else {
          console.warn('[push] Se omitió el registro de token en Expo Go Android. Usa un development build para push.');
        }
      }
    } catch (error) {
      const errorMsg = error.message || 'Ocurrió un error inesperado';
      Alert.alert('Error de autenticación', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        
        {/* LOGO */}
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Image 
              source={require('../../assets/logo_icon.png')} 
              style={styles.logoImage} 
              resizeMode="contain" 
            />
          </View>
          <Text style={styles.title}>Miti Miti</Text>
          <Text style={styles.subtitle}>Dividí gastos sin complicarte</Text>
        </View>

        {/* TABS LOGIN / REGISTRO */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'login' && styles.tabButtonActive]} 
            onPress={() => setActiveTab('login')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'login' && styles.tabButtonTextActive]}>
              Iniciar sesión
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'register' && styles.tabButtonActive]} 
            onPress={() => setActiveTab('register')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'register' && styles.tabButtonTextActive]}>
              Registrarme
            </Text>
          </TouchableOpacity>
        </View>

        {/* FORMULARIO */}
        <View style={styles.formContainer}>
          {activeTab === 'register' && (
            <View style={styles.inputWrapper}>
              <Ionicons 
                name="person-outline" 
                size={20} 
                color={colors.textSecondary} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder="Nombre completo"
                placeholderTextColor="#A4A4A4"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>
          )}

          {/* INPUT EMAIL */}
          <View style={[styles.inputWrapper, isEmailError && styles.inputWrapperError]}>
            <Ionicons 
              name="mail-outline" 
              size={20} 
              color={isEmailError ? '#EF4444' : colors.textSecondary} 
              style={styles.inputIcon} 
            />
            <TextInput
              style={styles.input}
              placeholder="Email (ej: usuario@gmail.com)"
              placeholderTextColor="#A4A4A4"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
            {isEmailError && (
              <Ionicons name="close-circle" size={18} color="#EF4444" />
            )}
            {isEmailValid && (
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            )}
          </View>
          {isEmailError && (
            <Text style={styles.fieldErrorText}>Ingresá un correo electrónico válido (ej: usuario@gmail.com)</Text>
          )}

          {/* INPUT CONTRASEÑA */}
          <View style={[styles.inputWrapper, isPasswordError && styles.inputWrapperError]}>
            <Ionicons 
              name="lock-closed-outline" 
              size={20} 
              color={isPasswordError ? '#EF4444' : colors.textSecondary} 
              style={styles.inputIcon} 
            />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="#A4A4A4"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={secureText}
              autoCapitalize="none"
              editable={!loading}
            />

            {/* CONTADOR EN VIVO DIRECTO DENTRO DEL INPUT */}
            {activeTab === 'register' && password.length > 0 && (
              <Text style={[
                styles.inlineCounter,
                { color: password.length >= 8 ? '#10B981' : '#EF4444' }
              ]}>
                {password.length}/8
              </Text>
            )}

            <TouchableOpacity 
              onPress={() => setSecureText(!secureText)} 
              style={styles.eyeIcon}
            >
              <Ionicons 
                name={secureText ? "eye-outline" : "eye-off-outline"} 
                size={20} 
                color={colors.textSecondary} 
              />
            </TouchableOpacity>
          </View>

          {/* MENSAJE EXPLICATIVO INFERIOR */}
          {activeTab === 'register' && password.length > 0 && (
            <View style={styles.passwordValidationRow}>
              <Ionicons 
                name={password.length >= 8 ? "checkmark-circle" : "alert-circle"} 
                size={16} 
                color={password.length >= 8 ? "#10B981" : "#EF4444"} 
              />
              <Text style={[
                styles.passwordValidationText,
                { color: password.length >= 8 ? "#10B981" : "#EF4444" }
              ]}>
                {password.length >= 8 
                  ? 'Contraseña válida' 
                  : `Mínimo 8 caracteres (te faltan ${8 - password.length})`}
              </Text>
            </View>
          )}

          {activeTab === 'login' && (
            <TouchableOpacity 
              style={styles.forgotBtn}
              onPress={() => {
                setResetEmail(email.trim());
                setResetPasswordVal('');
                setResetModalVisible(true);
              }}
            >
              <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* BOTÓN PRINCIPAL */}
        <TouchableOpacity 
          style={[
            styles.btnPrimary, 
            { backgroundColor: isFormValid && !loading ? colors.primary : '#BCCCDC' }
          ]} 
          onPress={handleSubmit}
          disabled={!isFormValid || loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {activeTab === 'login' ? 'Iniciar sesión' : 'Registrarme'}
            </Text>
          )}
        </TouchableOpacity>

        {/* TOGGLE FOOTER */}
        <TouchableOpacity 
          style={styles.footerToggle} 
          onPress={() => {
            setActiveTab(activeTab === 'login' ? 'register' : 'login');
            setPassword('');
          }}
          disabled={loading}
        >
          <Text style={styles.footerSubText}>
            {activeTab === 'login' ? '¿Sin cuenta? ' : '¿Ya tenés cuenta? '}
            <Text style={styles.footerActionText}>
              {activeTab === 'login' ? 'Registrate' : 'Iniciá sesión'}
            </Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>

      {/* MODAL RESTABLECER CONTRASEÑA */}
      <Modal
        visible={resetModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setResetModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setResetModalVisible(false)} />
          
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Restablecer contraseña</Text>
              <TouchableOpacity 
                onPress={() => setResetModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Ingresá tu correo electrónico registrado y tu nueva contraseña.
            </Text>

            {/* INPUT EMAIL */}
            <View style={[
              styles.inputWrapper,
              resetEmail.length > 0 && !isResetEmailValid && styles.inputWrapperError
            ]}>
              <Ionicons 
                name="mail-outline" 
                size={20} 
                color={resetEmail.length > 0 && !isResetEmailValid ? '#EF4444' : colors.textSecondary} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder="Email registrado"
                placeholderTextColor="#A4A4A4"
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!resetLoading}
              />
              {resetEmail.length > 0 && (
                <Ionicons 
                  name={isResetEmailValid ? "checkmark-circle" : "close-circle"} 
                  size={18} 
                  color={isResetEmailValid ? "#10B981" : "#EF4444"} 
                />
              )}
            </View>

            {/* INPUT NUEVA CONTRASEÑA */}
            <View style={[
              styles.inputWrapper,
              resetPasswordVal.length > 0 && !isResetPasswordValid && styles.inputWrapperError
            ]}>
              <Ionicons 
                name="lock-closed-outline" 
                size={20} 
                color={resetPasswordVal.length > 0 && !isResetPasswordValid ? '#EF4444' : colors.textSecondary} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder="Nueva contraseña (mín 8 car.)"
                placeholderTextColor="#A4A4A4"
                value={resetPasswordVal}
                onChangeText={setResetPasswordVal}
                secureTextEntry={resetSecureText}
                autoCapitalize="none"
                editable={!resetLoading}
              />

              {resetPasswordVal.length > 0 && (
                <Text style={[
                  styles.inlineCounter,
                  { color: resetPasswordVal.length >= 8 ? '#10B981' : '#EF4444' }
                ]}>
                  {resetPasswordVal.length}/8
                </Text>
              )}

              <TouchableOpacity 
                onPress={() => setResetSecureText(!resetSecureText)} 
                style={styles.eyeIcon}
              >
                <Ionicons 
                  name={resetSecureText ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color={colors.textSecondary} 
                />
              </TouchableOpacity>
            </View>

            {/* MENSAJE EN VIVO DE VALIDACIÓN */}
            {resetPasswordVal.length > 0 && (
              <View style={styles.passwordValidationRow}>
                <Ionicons 
                  name={resetPasswordVal.length >= 8 ? "checkmark-circle" : "alert-circle"} 
                  size={16} 
                  color={resetPasswordVal.length >= 8 ? "#10B981" : "#EF4444"} 
                />
                <Text style={[
                  styles.passwordValidationText,
                  { color: resetPasswordVal.length >= 8 ? "#10B981" : "#EF4444" }
                ]}>
                  {resetPasswordVal.length >= 8 
                    ? 'Contraseña válida' 
                    : `Mínimo 8 caracteres (faltan ${8 - resetPasswordVal.length})`}
                </Text>
              </View>
            )}

            {/* BOTONES DE ACCIÓN */}
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalCancelBtn}
                onPress={() => setResetModalVisible(false)}
                disabled={resetLoading}
              >
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  styles.modalConfirmBtn,
                  { backgroundColor: isResetFormValid && !resetLoading ? colors.primary : '#BCCCDC' }
                ]}
                onPress={handleResetPassword}
                disabled={!isResetFormValid || resetLoading}
              >
                {resetLoading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Actualizar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24, // Espacio normal y limpio, sin huecos gigantes
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBox: {
    width: 76,
    height: 76,
    backgroundColor: '#f9f7e2', 
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  logoImage: {
    width: 54,
    height: 54,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 25,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EAE7F0',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: 'white',
  },
  formContainer: {
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAE7F0',
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputWrapperError: {
    borderColor: '#EF4444',
    backgroundColor: '#FFF5F5',
  },
  inlineCounter: {
    fontSize: 13,
    fontWeight: '700',
    marginRight: 8,
  },
  fieldErrorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: -10,
    marginBottom: 12,
    marginLeft: 6,
    fontWeight: '500',
  },
  passwordValidationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 6,
  },
  passwordValidationText: {
    fontSize: 12,
    fontWeight: '500',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    color: colors.textPrimary,
  },
  eyeIcon: {
    padding: 4,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  forgotText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  btnPrimary: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  btnPrimaryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footerToggle: {
    alignItems: 'center',
    marginTop: 4,
  },
  footerSubText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  footerActionText: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: 'white',
  },
});