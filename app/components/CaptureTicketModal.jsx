import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { scanTicket } from '../services/ocrService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CaptureTicketModal({ visible, onClose, onAmountExtracted }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
  }, [visible]);

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.9,
          base64: false,
        });
        setCapturedPhoto(photo.uri);
      } catch (error) {
        Alert.alert('Error', 'No se pudo capturar la foto: ' + error.message);
      }
    }
  };

  const processTicket = async () => {
    if (!capturedPhoto) return;

    setIsProcessing(true);
    try {
      const { amount, ticketUrl } = await scanTicket(capturedPhoto);

      if (amount) {
        Alert.alert(
          'Importe detectado',
          `Se extrajo: $${amount.toFixed(2)}`,
          [
            {
              text: 'Cancelar',
              onPress: () => setIsProcessing(false),
              style: 'cancel',
            },
            {
              text: 'Usar',
              onPress: () => {
                onAmountExtracted({ amount, photo: capturedPhoto, ticketUrl });
                handleClose();
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'No se detectó importe',
          'El OCR no pudo extraer un número válido del ticket. Por favor, ingresa el importe manualmente.'
        );
        setIsProcessing(false);
      }
    } catch (error) {
      Alert.alert(
        'Error en OCR',
        'Ocurrió un error procesando la imagen. Intenta de nuevo con una foto más clara.'
      );
      console.error(error);
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setCapturedPhoto(null);
    setIsProcessing(false);
    onClose();
  };

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" transparent={true}>
        <View style={styles.centerContainer}>
          <TouchableOpacity style={{ position: 'absolute', top: 40, right: 20, padding: 8, zIndex: 10 }} onPress={handleClose}>
            <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>
          <Text style={styles.errorText}>No hay permiso de cámara</Text>
          <TouchableOpacity style={styles.btnClose} onPress={handleClose}>
            <Text style={styles.btnCloseText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" transparent={true}>
        <View style={styles.centerContainer}>
          <TouchableOpacity style={{ position: 'absolute', top: 40, right: 20, padding: 8, zIndex: 10 }} onPress={handleClose}>
            <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>
          <Text style={styles.errorText}>Se requiere permiso de cámara</Text>
          <TouchableOpacity style={styles.btnClose} onPress={requestPermission}>
            <Text style={styles.btnCloseText}>Solicitar permiso</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Escaneando ticket...</Text>
        </View>
      )}

      <View style={styles.fullScreen}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Escanear ticket</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={26} color="#333" />
          </TouchableOpacity>
        </View>

        {!capturedPhoto ? (
          <View style={styles.cameraContainer}>
            {/* Visor de cámara a pantalla completa */}
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
            />

            {/* Guía de encuadre (sólo un marco sutil, no tapa la cámara) */}
            <View style={styles.frameOverlay} pointerEvents="none">
              <View style={styles.frameCornerTL} />
              <View style={styles.frameCornerTR} />
              <View style={styles.frameCornerBL} />
              <View style={styles.frameCornerBR} />
            </View>

            {/* Instrucción pequeña al fondo del visor */}
            <View style={styles.instructionBanner} pointerEvents="none">
              <Text style={styles.instructionText}>
                📄 Apuntá al ticket y presioná Capturar
              </Text>
            </View>

            {/* Botón capturar superpuesto en la parte inferior */}
            <View style={styles.captureBar}>
              <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                <View style={styles.captureButtonInner} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.previewContainer}>
            <Image
              source={{ uri: capturedPhoto }}
              style={styles.previewImage}
              resizeMode="contain"
            />
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.btnRetry}
                onPress={() => setCapturedPhoto(null)}
              >
                <Ionicons name="camera-reverse-outline" size={18} color="white" style={{ marginRight: 6 }} />
                <Text style={styles.btnRetryText}>Nueva foto</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnProcessing}
                onPress={processTicket}
              >
                <Ionicons name="scan-outline" size={18} color="white" style={{ marginRight: 6 }} />
                <Text style={styles.btnProcessingText}>Escanear</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // --- Pantalla completa del modal de cámara ---
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 8,
    marginRight: -8,
  },

  // --- Visor de cámara ---
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },

  // --- Marco guía sutil (esquinas) ---
  frameOverlay: {
    position: 'absolute',
    top: '15%',
    left: '8%',
    right: '8%',
    bottom: '25%',
  },
  frameCornerTL: {
    position: 'absolute',
    top: 0, left: 0,
    width: 28, height: 28,
    borderTopWidth: 3, borderLeftWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopLeftRadius: 4,
  },
  frameCornerTR: {
    position: 'absolute',
    top: 0, right: 0,
    width: 28, height: 28,
    borderTopWidth: 3, borderRightWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopRightRadius: 4,
  },
  frameCornerBL: {
    position: 'absolute',
    bottom: 0, left: 0,
    width: 28, height: 28,
    borderBottomWidth: 3, borderLeftWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomLeftRadius: 4,
  },
  frameCornerBR: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 28, height: 28,
    borderBottomWidth: 3, borderRightWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomRightRadius: 4,
  },

  // --- Instrucción sutil al pie del visor ---
  instructionBanner: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },

  // --- Barra inferior con botón disparador ---
  captureBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  captureButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#ccc',
  },

  // --- Preview de la foto capturada ---
  previewContainer: {
    flex: 1,
    backgroundColor: '#111',
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  btnRetry: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    backgroundColor: '#555',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnRetryText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  btnProcessing: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnProcessingText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },

  // --- Estados de permiso ---
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  errorText: {
    fontSize: 16,
    color: 'white',
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  btnClose: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  btnCloseText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  // --- Overlay de carga durante OCR ---
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 15,
    fontWeight: '600',
  },
});
