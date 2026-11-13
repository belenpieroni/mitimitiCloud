import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

function formatPesos(monto) {
  const valor = Math.abs(Number(monto) || 0);
  const tieneDecimales = valor % 1 !== 0;
  return '$' + valor.toLocaleString('es-AR', {
    minimumFractionDigits: tieneDecimales ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function formatearFechaCabecera(fechaString) {
  if (!fechaString) return 'Sin fecha';
  const d = new Date(fechaString);
  if (isNaN(d.getTime())) return 'Sin fecha';

  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);

  const esMismoDia = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  if (esMismoDia(d, hoy)) return 'Hoy';
  if (esMismoDia(d, ayer)) return 'Ayer';

  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${d.getDate()} de ${meses[d.getMonth()]}`;
}

function formatearHora(fechaString) {
  if (!fechaString) return '';
  const d = new Date(fechaString);
  if (isNaN(d.getTime())) return '';
  let horas = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, '0');
  const ampm = horas >= 12 ? 'PM' : 'AM';
  horas = horas % 12 || 12;
  return `${horas}:${mins} ${ampm}`;
}

export default function ActividadesRecientesScreen({ navigation, route }) {
  const { user } = useAuth();
  const nombreUsuario = user?.name || '';
  const [actividades, setActividades] = useState(route.params?.actividades || []);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const cargarActividades = useCallback(async (showLoading = true) => {
    if (!nombreUsuario) return;
    try {
      if (showLoading) setLoading(true);
      const res = await api.get(`/deudas/actividades/${encodeURIComponent(nombreUsuario)}`);
      if (Array.isArray(res)) {
        setActividades(res);
      }
    } catch (err) {
      console.error('Error cargando actividades completas:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [nombreUsuario]);

  useEffect(() => {
    if (!route.params?.actividades || route.params.actividades.length === 0) {
      cargarActividades(true);
    }
  }, [route.params?.actividades, cargarActividades]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    cargarActividades(false);
  }, [cargarActividades]);

  const handleNavegarActividad = (act) => {
    if (act.tipo === 'juntada' || act.tipo === 'juntada_gasto') {
      navigation.navigate('Juntadas', {
        screen: 'JuntadaDetalle',
        params: { juntadaId: act.targetId },
      });
    } else if (act.tipo === 'vivienda_servicio' || act.tipo === 'vivienda_gasto') {
      navigation.navigate('Vivienda', {
        screen: 'ViviendaDashboard',
      });
    }
  };

  // Agrupamiento por fecha en orden descendente
  const grupos = [];
  actividades.forEach((act) => {
    const fechaLabel = formatearFechaCabecera(act.fecha);
    let grupo = grupos.find((g) => g.fecha === fechaLabel);
    if (!grupo) {
      grupo = { fecha: fechaLabel, items: [] };
      grupos.push(grupo);
    }
    grupo.items.push(act);
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Actividades recientes</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : grupos.length === 0 ? (
          <View style={styles.vacioCentrado}>
            <Ionicons name="time-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 10 }} />
            <Text style={styles.vacioTexto}>No hay actividades registradas todavía.</Text>
          </View>
        ) : (
          grupos.map((grupo, gIdx) => (
            <View key={`grupo-${gIdx}`} style={styles.grupoContainer}>
              <Text style={styles.grupoFechaHeader}>{grupo.fecha}</Text>
              {grupo.items.map((act) => {
                const hora = formatearHora(act.fecha);
                return (
                  <TouchableOpacity
                    key={`${act.tipo}-${act.id}`}
                    style={styles.actividadCard}
                    onPress={() => handleNavegarActividad(act)}
                  >
                    <View style={[styles.actividadIcono, { backgroundColor: act.color ? `${act.color}18` : colors.secondary }]}>
                      <Ionicons name={act.icono || 'receipt-outline'} size={20} color={act.color || colors.primary} />
                    </View>
                    <View style={styles.actividadInfo}>
                      <View style={styles.actividadTopRow}>
                        <Text style={styles.actividadNombre} numberOfLines={1}>
                          {act.titulo}
                        </Text>
                        {!!hora && <Text style={styles.actividadHora}>{hora}</Text>}
                      </View>
                      <Text style={styles.actividadSub} numberOfLines={1}>
                        {act.subtitulo}
                      </Text>
                    </View>
                    {act.monto != null && Number(act.monto) > 0 && (
                      <View style={styles.actividadMontoCol}>
                        <Text style={styles.actividadMonto}>{formatPesos(act.monto)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: colors.background,
  },
  headerSide: { width: 44, alignItems: 'flex-start' },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  title: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  content: { padding: 20, paddingBottom: 40 },
  grupoContainer: { marginBottom: 20 },
  grupoFechaHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actividadCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actividadIcono: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actividadInfo: { flex: 1 },
  actividadTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  actividadNombre: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  actividadHora: { fontSize: 11, color: colors.textSecondary },
  actividadSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  actividadMontoCol: { alignItems: 'flex-end', marginLeft: 6 },
  actividadMonto: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  vacioCentrado: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  vacioTexto: { color: colors.textSecondary, fontSize: 14 },
});
