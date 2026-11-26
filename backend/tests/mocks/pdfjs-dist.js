// Stub de pdfjs-dist para Jest (ver moduleNameMapper en jest.config.js).
module.exports = {
  getDocument() {
    throw new Error('pdfjs-dist no está disponible en los tests');
  },
};
