import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { obtenerNotificaciones } from '../services/notificationsService';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const modulos = [
  { id: '1', nombre: 'Juntadas', icono: 'people-outline' },
  { id: '2', nombre: 'Vivienda', icono: 'home-outline' },
];

function getSaludo() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatPesos(monto) {
  const valor = Math.abs(Number(monto) || 0);
  const tieneDecimales = valor % 1 !== 0;
  return '$' + valor.toLocaleString('es-AR', {
    minimumFractionDigits: tieneDecimales ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function getRelativeTime(fechaIso) {
  if (!fechaIso) return '';
  const diffMs = Date.now() - new Date(fechaIso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ayer';
  return `Hace ${days} d`;
}

async function fetchConsolidadoBalance(nombre) {
  try {
    const data = await api.get(`/deudas/consolidado/${encodeURIComponent(nombre)}`);
    if (!data) return null;
    
    let acreedores = [];
    let servicios = [];
    if (Array.isArray(data)) {
      acreedores = data;
    } else {
      acreedores = data.acreedores || [];
      servicios = data.serviciosAPagar || [];
    }

    const porPagarAcreedores = acreedores.reduce((acc, a) => {
      const netTotal = (a.conceptos || []).reduce((sum, c) => sum + (c.tipoOperacion === 'resta' ? -c.monto : c.monto), 0);
      return acc + Math.max(0, netTotal);
    }, 0);

    const porCobrar = acreedores.reduce((acc, a) => {
      const netTotal = (a.conceptos || []).reduce((sum, c) => sum + (c.tipoOperacion === 'resta' ? -c.monto : c.monto), 0);
      return acc + (netTotal < 0 ? Math.abs(netTotal) : 0);
    }, 0);

    const porPagarServicios = servicios.reduce((acc, s) => acc + (s.monto || 0), 0);
    const porPagar = porPagarAcreedores + porPagarServicios;

    return {
      total: porCobrar - porPagar,
      porCobrar,
      porPagar
    };
  } catch (error) {
    console.error('Error fetching consolidado:', error);
    return null;
  }
}

export default function HomeScreen({ navigation }) {
  const { user, token } = useAuth();
  const nombreUsuario = user?.name || 'Usuario';
  const inicialesUsuario = (nombreUsuario || 'US')
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const nombre = user?.name || 'Usuario';

  const [balance, setBalance] = useState({
    total: 0,
    porCobrar: 0,
    porPagar: 0
  });
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const cargarDatos = useCallback(async () => {
    if (!user?.name) return;
    setCargando(true);
    try {
      const [dataBalance, resActividades, resNotif] = await Promise.all([
        fetchConsolidadoBalance(nombre),
        api.get(`/deudas/actividades/${encodeURIComponent(nombre)}`),
        token ? obtenerNotificaciones(token) : Promise.resolve([]),
      ]);

      if (dataBalance) {
        setBalance(dataBalance);
      }

      if (Array.isArray(resActividades)) {
        setActividades(resActividades);
      } else {
        setActividades([]);
      }
      
      const notifs = Array.isArray(resNotif) ? resNotif : resNotif?.data?.data || resNotif?.data || [];
      if (Array.isArray(notifs)) {
        const unread = notifs.filter(n => !n.leida).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error("Error cargando la Home: ", err);
    } finally {
      setCargando(false);
    }
  }, [nombre, user?.name, token]);

  useFocusEffect(
    useCallback(() => { 
      cargarDatos(); 
    }, [cargarDatos])
  );

  const handleNavegarActividad = (act) => {
    if (act.tipo === 'juntada' || act.tipo === 'juntada_gasto') {
      navigation.navigate('Juntadas', { 
        screen: 'JuntadaDetalle', 
        params: { juntadaId: act.targetId } 
      });
    } else if (act.tipo === 'vivienda_servicio' || act.tipo === 'vivienda_gasto') {
      navigation.navigate('Vivienda', { 
        screen: 'ViviendaDashboard' 
      });
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.saludo}>{getSaludo()}</Text>
          <Text style={styles.nombre}>{nombreUsuario}</Text>
        </View>
        <View style={styles.headerIconos}>
          <TouchableOpacity style={styles.iconoBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => navigation.navigate('Perfil')}
          >
            <Text style={styles.avatarTexto}>{inicialesUsuario}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardBalance}>
        <Text style={styles.balanceLabel}>Balance total</Text>
        {cargando ? (
          <ActivityIndicator color="white" style={{ marginVertical: 12 }} />
        ) : (
          <>
            <Text style={styles.balanceTotal}>
              {balance.total < 0 ? '– ' : balance.total > 0 ? '+ ' : ''}
              {formatPesos(balance.total)}
            </Text>
            
            <View style={styles.balanceFila}>
              <View style={[styles.balanceItem, { position: 'relative' }]}>
                <Text style={styles.balanceSubLabel}>Por cobrar</Text>
                <Text style={[styles.balanceValor, { color: colors.greenGlobal }]}>
                  {formatPesos(balance.porCobrar)}
                </Text>
                
                <Ionicons name="trending-up" size={14} color={colors.greenGlobal} style={{ position: 'absolute', top: 12, right: 12 }} />
              </View>
              
              <View style={[styles.balanceItem, { position: 'relative' }]}>
                <Text style={styles.balanceSubLabel}>Por pagar</Text>
                <Text style={[styles.balanceValor, { color: '#ec6c6a' }]}>
                  {formatPesos(balance.porPagar)}
                </Text>
                
                <Ionicons name="trending-down" size={14} color="#ec6c6a" style={{ position: 'absolute', top: 12, right: 12 }} />
              </View>
            </View>

            <TouchableOpacity 
              style={styles.btnVerDeudas} 
              onPress={() => navigation.navigate('Deudas')}
            >
              <Text style={styles.btnVerDeudasTexto}>Ver deudas</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.seccionTitulo}>Módulos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modulosScroll}>
        {modulos.map((mod) => (
          <TouchableOpacity 
            key={mod.id} 
            style={styles.moduloCard}
            onPress={() => {
              if (mod.nombre === 'Vivienda') {
                navigation.navigate('Vivienda', { screen: 'ViviendaDashboard' });
              } else if (mod.nombre === 'Juntadas') {
                navigation.navigate('Juntadas', { screen: 'JuntadasList' });
              }
            }}
          >
            <Ionicons name={mod.icono} size={28} color={colors.primary} />
            <Text style={styles.moduloNombre}>{mod.nombre}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.seccionHeader}>
        <Text style={styles.seccionTitulo}>Actividades recientes</Text>
        {actividades.length > 4 && (
          <TouchableOpacity onPress={() => navigation.navigate('ActividadesRecientes', { actividades })}>
            <Text style={styles.verTodo}>Ver más &gt;</Text>
          </TouchableOpacity>
        )}
      </View>

      {cargando ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
      ) : actividades.length === 0 ? (
        <View style={styles.vacioCentrado}>
          <Text style={styles.vacioTexto}>Sin actividad reciente todavía</Text>
        </View>
      ) : (
        actividades.slice(0, 4).map((act) => {
          const tiempoRelativo = getRelativeTime(act.fecha);
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
                  <Text style={styles.actividadNombre} numberOfLines={1}>{act.titulo}</Text>
                  {!!tiempoRelativo && (
                    <Text style={styles.actividadTiempo}>{tiempoRelativo}</Text>
                  )}
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
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  saludo: { fontSize: 13, color: colors.textSecondary },
  nombre: { fontSize: 28, fontWeight: 'bold', color: colors.textPrimary },
  headerIconos: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconoBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.cardBg, justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute', top: 4, right: 6,
    backgroundColor: '#E63946', borderRadius: 8,
    minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: colors.cardBg,
  },
  badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  avatarTexto: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  cardBalance: { backgroundColor: colors.primary, borderRadius: 20, padding: 20, marginBottom: 24 },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13,  fontWeight: '700', marginBottom: 8 },
  balanceTotal: { color: 'white', fontSize: 36, fontWeight: 'bold', marginBottom: 16 },
  balanceFila: { flexDirection: 'row', gap: 12 },
  balanceItem: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12,
  },
  balanceSubLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 },
  balanceValor: { fontSize: 16, fontWeight: 'bold' },
  seccionTitulo: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 12 },
  seccionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12, marginTop: 8,
  },
  verTodo: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  modulosScroll: { marginBottom: 24 },
  moduloCard: {
    backgroundColor: colors.cardBg, borderRadius: 16, padding: 16,
    marginRight: 12, alignItems: 'center', width: 110, gap: 8,
  },
  moduloNombre: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  
  actividadCard: {
    backgroundColor: colors.cardBg, borderRadius: 16, padding: 14,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  actividadIcono: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
  },
  actividadInfo: { flex: 1 },
  actividadTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  actividadNombre: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  actividadTiempo: { fontSize: 11, color: colors.textSecondary },
  actividadSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  actividadMontoCol: { alignItems: 'flex-end', marginLeft: 6 },
  actividadMonto: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  vacioCentrado: { alignItems: 'center', paddingVertical: 24 },
  vacioTexto: { color: colors.textSecondary, fontSize: 13 },
  btnVerDeudas: { 
    backgroundColor: '#d6c1eb', 
    paddingVertical: 12, 
    borderRadius: 14, 
    marginTop: 10, 
    alignItems: 'center' 
  },
  btnVerDeudasTexto: { 
    color: colors.primary, 
    fontWeight: '700', 
    fontSize: 14 
  },
});
