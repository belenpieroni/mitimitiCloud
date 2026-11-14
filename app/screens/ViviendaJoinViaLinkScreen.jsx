import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { unirseViviendaViaToken } from '../services/viviendaService';

function extractToken(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.includes('mitimiti://vivienda/join/')) {
    return trimmed.split('mitimiti://vivienda/join/')[1] || null;
  }
  return trimmed || null;
}

export default function ViviendaJoinViaLinkScreen({ route, navigation }) {
  const { token } = route.params || {};
  const [tokenInput, setTokenInput] = useState(token || '');

  // estados del flujo principal
  const [estado, setEstado] = useState('pendiente'); // pendiente | cargando | ok | error
  const [nombreVivienda, setNombreVivienda] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // estado del cartel de confirmación de cambio
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmData, setConfirmData] = useState(null); // { actual, destino, token }
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ——— Intento inicial de unirse ———
  async function handleUnirse() {
    const tk = extractToken(tokenInput);
    if (!tk) {
      setEstado('error');
      setErrorMsg('Token o enlace inválido. Revisá lo que pegaste.');
      return;
    }

    setEstado('cargando');
    try {
      const vivienda = await unirseViviendaViaToken(tk, false);
      setNombreVivienda(vivienda?.nombre || 'tu nueva vivienda');
      setEstado('ok');
      setTimeout(() => {
        navigation.replace('AppTabs', { screen: 'Vivienda', params: { screen: 'ViviendaDashboard' } });
      }, 1400);
    } catch (e) {
      if (e.message === 'Ya pertenecés a una vivienda.') {
        // El backend incluye los nombres en el error (api.js los preserva en e.viviendaActual / e.viviendaDestino)
        setEstado('pendiente');
        setConfirmData({
          token: tk,
          actual: e.viviendaActual?.nombre || null,
          destino: e.viviendaDestino?.nombre || null,
        });
        setConfirmVisible(true);
        return;
      }
      setEstado('error');
      setErrorMsg(e.message || 'No se pudo procesar la invitación.');
    }
  }

  // ——— El usuario confirma el cambio de vivienda ———
  async function handleConfirmarCambio() {
    setConfirmLoading(true);
    try {
      const vivienda = await unirseViviendaViaToken(confirmData.token, true);
      setNombreVivienda(vivienda?.nombre || 'tu nueva vivienda');
      setConfirmVisible(false);
      setEstado('ok');
      setTimeout(() => {
        navigation.replace('AppTabs', { screen: 'Vivienda', params: { screen: 'ViviendaDashboard' } });
      }, 1400);
    } catch (e) {
      setConfirmVisible(false);
      setEstado('error');
      setErrorMsg(e.message || 'No se pudo realizar el cambio de vivienda.');
    } finally {
      setConfirmLoading(false);
    }
  }

  // ——— Renders de estado ———
  if (estado === 'cargando') {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.sub}>Uniéndote a la vivienda…</Text>
      </View>
    );
  }

  if (estado === 'ok') {
    return (
      <View style={[styles.container, styles.center]}>
        <View style={styles.circleOk}><Ionicons name="checkmark" size={36} color="white" /></View>
        <Text style={styles.title}>¡Listo!</Text>
        <Text style={styles.sub}>Ahora formás parte de "{nombreVivienda}"</Text>
      </View>
    );
  }

  if (estado === 'error') {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle-outline" size={56} color="#EF4444" />
        <Text style={styles.title}>No se pudo unir</Text>
        <Text style={styles.sub}>{errorMsg}</Text>
        <TouchableOpacity style={styles.btnGhost} onPress={() => setEstado('pendiente')}>
          <Text style={styles.btnGhostTxt}>Intentar de nuevo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnGhost, { marginTop: 8 }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.btnGhostTxt, { color: colors.textSecondary }]}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ——— pantalla principal (estado === 'pendiente') ———
  return (
    <View style={[styles.container, styles.center]}>
      <View style={styles.card}>
        <View style={styles.circle}><Ionicons name="home-outline" size={34} color="white" /></View>
        <Text style={styles.title}>Invitación a vivienda</Text>
        <Text style={styles.sub}>
          Te invitaron a una vivienda compartida. Pegá el enlace o token y confirmá para unirte.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Pegá acá el enlace o token"
          placeholderTextColor={colors.textSecondary}
          value={tokenInput}
          onChangeText={setTokenInput}
          autoCapitalize="none"
          autoCorrect={false}
          multiline={false}
        />
        <TouchableOpacity
          style={[styles.btnPrimary, !tokenInput.trim() && { opacity: 0.5 }]}
          onPress={handleUnirse}
          disabled={!tokenInput.trim()}
        >
          <Text style={styles.btnPrimaryTxt}>Unirme</Text>
        </TouchableOpacity>
      </View>

      {/* ——— Modal de confirmación de cambio de vivienda ——— */}
      <Modal visible={confirmVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="swap-horizontal-outline" size={30} color="white" />
            </View>

            <Text style={styles.modalTitle}>¿Cambiar de vivienda?</Text>

            <Text style={styles.modalBody}>
              Ya pertenecés a una vivienda.{'\n\n'}
              {confirmData?.actual
                ? `Si aceptás, saldrás de "${confirmData.actual}" y te unirás a "${confirmData.destino || 'la nueva vivienda'}".`
                : 'Si aceptás, saldrás de tu vivienda actual y te unirás a la nueva.'}
              {'\n\n'}
              <Text style={{ color: '#EF4444', fontWeight: '600' }}>
                Esta acción no se puede deshacer.
              </Text>
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnCancelar}
                onPress={() => setConfirmVisible(false)}
                disabled={confirmLoading}
              >
                <Text style={styles.btnCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnConfirmar}
                onPress={handleConfirmarCambio}
                disabled={confirmLoading}
              >
                {confirmLoading
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text style={styles.btnConfirmarTxt}>Sí, cambiar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },

  card: {
    width: '100%', backgroundColor: 'white', borderRadius: 22,
    padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  circle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  circleOk: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#10B981',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  input: {
    width: '100%', marginTop: 16, borderWidth: 1, borderColor: '#EAE7F0',
    borderRadius: 12, backgroundColor: colors.background,
    paddingHorizontal: 14, paddingVertical: 12,
    color: colors.textPrimary, fontSize: 14,
  },
  btnPrimary: {
    marginTop: 18, backgroundColor: colors.primary,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center',
  },
  btnPrimaryTxt: { color: 'white', fontWeight: '700', fontSize: 15 },

  btnGhost: {
    marginTop: 16, backgroundColor: '#F1F5F9',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24,
  },
  btnGhostTxt: { color: colors.textPrimary, fontWeight: '600', textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: 'white', borderRadius: 22, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 8,
  },
  modalIconWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  modalBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  btnCancelar: {
    flex: 1, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  btnCancelarTxt: { fontWeight: '600', color: colors.textSecondary, fontSize: 15 },
  btnConfirmar: {
    flex: 1.4, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.primary,
  },
  btnConfirmarTxt: { fontWeight: '700', color: 'white', fontSize: 15 },
});
