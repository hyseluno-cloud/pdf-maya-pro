import React, { useState, useRef, useEffect } from 'react';
import './index.css';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Download, 
  Type, 
  Upload,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Edit3,
  MousePointer2,
  Save,
  ShieldCheck,
  Zap,
  Lock
} from 'lucide-react';

// Librerías de procesamiento - Cargadas desde CDN para facilitar el despliegue
const loadScripts = () => {
  return Promise.all([
    new Promise((resolve) => {
      if (window.PDFLib) return resolve();
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      script.onload = resolve;
      document.head.appendChild(script);
    }),
    new Promise((resolve) => {
      if (window.pdfjsLib) return resolve();
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      document.head.appendChild(script);
    })
  ]);
};

const App = () => {
  const [pdfBytes, setPdfBytes] = useState(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  
  // Estados para la detección y edición de objetos de texto
  const [detectedText, setDetectedText] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [tempText, setTempText] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    loadScripts();
  }, []);

  useEffect(() => {
    if (pdfBytes) {
      renderAndAnalyze(currentPage);
    }
  }, [pdfBytes, currentPage, zoom]);

  // Renderiza el PDF en el canvas y extrae las capas de texto
  const renderAndAnalyze = async (pageNumber) => {
    if (!window.pdfjsLib || !pdfBytes) return;
    setLoading(true);
    
    try {
      // Clonamos el buffer para evitar el error de "Detached ArrayBuffer"
      const dataCopy = new Uint8Array(pdfBytes.slice(0));
      const loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
      const pdf = await loadingTask.promise;
      setNumPages(pdf.numPages);
      
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom * 1.5 });
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      // Extracción de metadatos de texto
      const textContent = await page.getTextContent();
      const items = textContent.items.map(item => {
        const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
        
        const width = (item.width || 0) * zoom * 1.5;
        const height = (item.height || 0) * zoom * 1.5;
        const fontSize = Math.sqrt(item.transform[0]**2 + item.transform[1]**2) * zoom * 1.5;

        return {
          str: item.str,
          x: tx[4] || 0,
          y: (tx[5] || 0) - height, 
          width: width > 0 ? width : 20, 
          height: height > 0 ? height : fontSize || 12,
          fontSize: fontSize || 12,
          original: item
        };
      }).filter(item => item.str && item.str.trim().length > 0);

      setDetectedText(items);
    } catch (error) {
      console.error("Error analizando PDF:", error);
      showStatus('error', 'Error al procesar la estructura del documento.');
    } finally {
      setLoading(false);
    }
  };

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      setPdfBytes(arrayBuffer);
      setCurrentPage(1);
      setEditingIndex(null);
    } catch (error) {
      showStatus('error', 'No se pudo cargar el archivo.');
    } finally {
      setLoading(false);
    }
  };

  // Función para guardar los cambios en el texto
  const saveTextEdit = async () => {
    if (editingIndex === null || !pdfBytes) return;
    setLoading(true);
    
    try {
      const item = detectedText[editingIndex];
      const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
      
      // Cargamos el PDF clonando el buffer original para evitar el error de memoria
      const doc = await PDFDocument.load(pdfBytes.slice(0));
      const pages = doc.getPages();
      const page = pages[currentPage - 1];
      
      const orig = item.original;
      const x = orig.transform[4];
      const y = orig.transform[5];
      const w = orig.width;
      
      const detectedSize = Math.sqrt(orig.transform[0]**2 + orig.transform[1]**2);
      const fontSize = detectedSize > 0 ? detectedSize : 12;

      // 1. Ocultar el texto viejo con un rectángulo blanco
      page.drawRectangle({
        x: x - 1,
        y: y - (fontSize * 0.2), 
        width: w + 2,
        height: fontSize * 1.2,
        color: rgb(1, 1, 1), 
      });

      // 2. Insertar el nuevo texto en la misma posición
      const font = await doc.embedFont(StandardFonts.Helvetica);
      
      page.drawText(tempText, {
        x: x,
        y: y,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });

      const modifiedBytes = await doc.save();
      setPdfBytes(modifiedBytes.buffer);
      setEditingIndex(null);
      showStatus('success', '¡Texto actualizado correctamente!');
    } catch (error) {
      console.error("Error guardando:", error);
      showStatus('error', 'No se pudieron aplicar los cambios.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = () => {
    if (!pdfBytes) return;
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `PDF_MAYA_PRO_${fileName}`;
    link.click();
    showStatus('success', 'Descarga iniciada.');
  };

  const safeWidth = canvasRef.current && !isNaN(canvasRef.current.width) 
    ? canvasRef.current.width / (window.devicePixelRatio || 1) 
    : 600;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Barra de Navegación Principal */}
      <nav className="bg-white/90 backdrop-blur-lg border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.location.reload()}>
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-100 group-hover:rotate-12 transition-all">
            <Zap size={22} fill="currentColor" />
          </div>
          <span className="font-black text-2xl tracking-tighter text-slate-800 uppercase">PDF <span className="text-indigo-600">MAYA</span> PRO</span>
        </div>

        <div className="flex items-center gap-4">
          {pdfBytes && (
            <button 
              onClick={downloadPdf}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-slate-800 shadow-xl transition-all active:scale-95"
            >
              <Download size={16} /> Guardar Cambios
            </button>
          )}
        </div>
      </nav>

      {!pdfBytes ? (
        /* Estado de Bienvenida / Landing */
        <div className="flex flex-col items-center">
          <section className="pt-24 pb-16 px-6 text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-8 animate-pulse">
              <Lock size={12} /> Procesamiento 100% Local y Seguro
            </div>
            <h1 className="text-6xl md:text-7xl font-black text-slate-900 tracking-tight leading-[1.05] mb-8">
              La forma inteligente de <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">editar tus archivos PDF.</span>
            </h1>
            <p className="text-slate-500 text-xl max-w-2xl mx-auto mb-14 leading-relaxed">
              Detecta capas de texto originales y modifícalas al instante. Sin suscripciones costosas, sin subir tus datos a la nube.
            </p>

            {/* Zona de Carga */}
            <div 
              onClick={() => fileInputRef.current.click()}
              className="bg-white border-2 border-dashed border-slate-300 rounded-[3rem] p-20 group cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/20 transition-all duration-500 shadow-2xl relative overflow-hidden"
            >
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <Upload size={40} />
                </div>
                <h3 className="text-3xl font-black text-slate-800 mb-2">Sube tu PDF</h3>
                <p className="text-slate-400 font-bold text-sm tracking-wide uppercase">Haz clic o arrastra el archivo aquí</p>
              </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
          </section>

          {/* Características secundarias */}
          <section className="flex flex-wrap justify-center gap-12 max-w-6xl w-full px-6 pb-24 opacity-60">
             <div className="flex items-center gap-3 font-bold text-slate-500"><ShieldCheck className="text-emerald-500" /> Privacidad Bancaria</div>
             <div className="flex items-center gap-3 font-bold text-slate-500"><Zap className="text-amber-500" /> Sin Servidores</div>
             <div className="flex items-center gap-3 font-bold text-slate-500"><Edit3 className="text-indigo-500" /> Edición de Capas</div>
          </section>
        </div>
      ) : (
        /* Estado del Editor Activo */
        <div className="flex flex-col h-[calc(100vh-77px)]">
          {/* Barra de Herramientas del Editor */}
          <div className="bg-white border-b border-slate-200 px-8 py-3.5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
               <button 
                onClick={() => {
                  setIsEditMode(!isEditMode);
                  setEditingIndex(null);
                }}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
                  isEditMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {isEditMode ? <Edit3 size={16} /> : <MousePointer2 size={16} />}
                {isEditMode ? "MODO EDICIÓN ACTIVO" : "MODO VISUALIZACIÓN"}
              </button>
              
              <div className="h-6 w-px bg-slate-200" />
              
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-2 hover:bg-white hover:shadow-sm rounded-lg disabled:opacity-20 transition-all"><ChevronLeft size={18}/></button>
                <span className="text-xs font-black px-4 text-slate-500">{currentPage} <span className="text-slate-300">/</span> {numPages}</span>
                <button onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))} disabled={currentPage === numPages} className="p-2 hover:bg-white hover:shadow-sm rounded-lg disabled:opacity-20 transition-all"><ChevronRight size={18}/></button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all"><ZoomOut size={16}/></button>
                <span className="text-[10px] font-black w-12 text-center text-slate-600">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all"><ZoomIn size={16}/></button>
              </div>
            </div>
          </div>

          {/* Lienzo de Trabajo */}
          <div className="flex-1 bg-slate-100 overflow-auto p-12 flex justify-center custom-scrollbar">
            {loading && (
              <div className="fixed inset-0 bg-white/40 z-[60] flex items-center justify-center backdrop-blur-[2px]">
                <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 border border-indigo-50">
                  <div className="w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="font-black text-indigo-900 text-[10px] tracking-[0.2em] uppercase">Analizando Estructura...</p>
                </div>
              </div>
            )}

            <div 
              className="relative shadow-[0_50px_100px_rgba(0,0,0,0.12)] bg-white origin-top transition-transform duration-300" 
              style={{ width: safeWidth }}
            >
              <canvas ref={canvasRef} className="block w-full h-auto" />
              
              {/* Capa Interactiva de Edición de Objetos */}
              {isEditMode && (
                <div ref={overlayRef} className="absolute inset-0 pointer-events-none">
                  {detectedText.map((item, idx) => (
                    <div 
                      key={idx}
                      className={`absolute pointer-events-auto transition-all duration-200 border border-transparent ${
                        editingIndex === idx ? 'ring-4 ring-indigo-500/30 bg-white shadow-2xl z-[100] border-indigo-500' : 'hover:bg-indigo-500/10 hover:border-indigo-300'
                      }`}
                      style={{
                        left: item.x || 0,
                        top: item.y || 0,
                        width: item.width || 0,
                        height: item.height || 0,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingIndex(idx);
                        setTempText(item.str);
                      }}
                    >
                      {editingIndex === idx && (
                        <div 
                          className="absolute -top-16 left-0 bg-white p-3 rounded-2xl shadow-2xl border border-slate-100 flex items-center gap-3 pointer-events-auto min-w-[350px] z-[110] animate-in zoom-in-95"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input 
                            autoFocus
                            className="flex-1 px-4 py-2.5 text-sm font-bold border-none bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            value={tempText}
                            onChange={(e) => setTempText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveTextEdit()}
                          />
                          <div className="flex gap-1.5">
                            <button 
                              onClick={saveTextEdit} 
                              className="bg-emerald-500 text-white p-2.5 rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-100 transition-all active:scale-90"
                            >
                              <CheckCircle2 size={18}/>
                            </button>
                            <button 
                              onClick={() => setEditingIndex(null)} 
                              className="bg-slate-100 text-slate-400 p-2.5 rounded-xl hover:bg-slate-200 transition-all"
                            >
                              <Plus className="rotate-45" size={18}/>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer minimalista de notificaciones */}
      {status.message && (
        <div className={`fixed top-24 right-8 z-[100] p-5 rounded-2xl shadow-2xl border flex items-center gap-4 animate-in slide-in-from-right-8 duration-500 ${
          status.type === 'error' ? 'bg-red-50 text-red-800 border-red-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'
        }`}>
          {status.type === 'error' ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-50 uppercase">Mensaje</span>
            <span className="font-bold text-sm tracking-tight">{status.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;