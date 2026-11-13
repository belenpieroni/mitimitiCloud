const express = require('express');
const router = express.Router();
const deudasController = require('../controllers/deudasController');
const { optionalAuth } = require('../middleware/authMiddleware');

router.use(optionalAuth);

router.get('/consolidado/:usuarioNombre', deudasController.getConsolidado);
router.get('/actividades/:usuarioNombre', deudasController.getActividadesRecientes);
router.patch('/pagar/:deudaId', deudasController.pagarDeuda);
router.post('/pagar_multiple', deudasController.pagarMultiple);

module.exports = router;

