import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, Trash2, Download, Upload, AlertCircle, 
  CheckCircle2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, 
  Edit3, MousePointer2, Zap, Lock, PenTool, Move, Maximize,
  ShieldCheck, Smartphone, Crown, X, CreditCard, KeyRound,
  MessageCircle
} from 'lucide-react';

// --- CONFIGURACIÓN DE SEGURIDAD MATÍAS ---
// El usuario SOLO será PRO si ingresa este código. 
const PRO_ACTIVATION_CODE = "MAYA2026"; 
const WHATSAPP_NUMBER = "5492477504615"; 

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
  const [isPro, setIsPro] = useState(false); 
  const [showPayModal, setShowPayModal] = useState(false);
  const [inputCode, setInputCode] = useState(""); 
  
  const [detectedText, setDetectedText] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [tempText, setTempText] = useState("");
  const [mode, setMode] = useState('view'); 

  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImg, setSignatureImg] = useState(null);
  const [sigPos, setSigPos] = useState({ x: 50, y: 50 });
  const [sigSize, setSigSize] = useState({ width: 140, height: 70 });
  const [isDraggingSig, setIsDraggingSig] = useState(false);
  const [isResizingSig, setIsResizingSig] = useState(false);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const signatureCanvasRef = useRef(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartPos = useRef({ w: 0, h: 0, x: 0, y: 0 });

  useEffect(() => { loadScripts(); }, []);
  useEffect(() => { if (pdfBytes) renderAndAnalyze(currentPage); }, [pdfBytes, currentPage, zoom]);

  const renderAndAnalyze = async (pageNumber) => {
    if (!window.pdfjsLib || !pdfBytes) return;
    setLoading(true);
    try {
      const dataCopy = new Uint8Array(pdfBytes.slice(0));
      const loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
      const pdf = await loadingTask.promise;
      setNumPages(pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const outputScale = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: zoom * 1.5 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";
      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
      await page.render({ canvasContext: context, viewport, transform }).promise;

      const textContent = await page.getTextContent();
      const items = textContent.items.map(item => {
        const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontSize = Math.sqrt(item.transform[0]**2 + item.transform[1]**2);
        return {
          str: item.str,
          x: tx[4],
          y: tx[5] - (fontSize * zoom * 1.5),
          width: item.width * zoom * 1.5,
          height: fontSize * zoom * 1.5,
          original: item,
          fontSize: fontSize
        };
      }).filter(item => item.str.trim().length > 0 && item.fontSize > 1);
      setDetectedText(items);
    } catch (err) { showStatus('error', 'Error analizando PDF.'); }
    finally { setLoading(false); }
  };

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 3000);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      setPdfBytes(arrayBuffer);
    } catch (err) { showStatus('error', 'Error de carga.'); }
    setLoading(false);
  };

  const handleDownload = async () => {
    if (!pdfBytes) return;
    setLoading(true);
    try {
      const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
      const doc = await PDFDocument.load(pdfBytes.slice(0));
      const pages = doc.getPages();
      const font = await doc.embedFont(StandardFonts.HelveticaBold);

      if (!isPro) {
        pages.forEach(page => {
          const { width } = page.getSize();
          page.drawText('Editado con PDF MAYA PRO', {
            x: width - 160,
            y: 20,
            size: 8,
            font,
            color: rgb(0.7, 0.7, 0.7),
            opacity: 0.4
          });
        });
      }

      const bytes = await doc.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = isPro ? `MAYA_PRO_${fileName}` : `MAYA_PREVIEW_${fileName}`;
      link.click();
      
      if (!isPro) {
        showStatus('success', 'Descargado con marca de agua.');
        setShowPayModal(true);
      } else {
        showStatus('success', 'Documento Pro exportado.');
      }
    } catch (err) { showStatus('error', 'Error al exportar.'); }
    setLoading(false);
  };

  const saveTextEdit = async () => {
    if (editingIndex === null || !pdfBytes) return;
    setLoading(true);
    try {
      const item = detectedText[editingIndex];
      const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
      const doc = await PDFDocument.load(pdfBytes.slice(0));
      const page = doc.getPages()[currentPage - 1];
      const orig = item.original;
      page.drawRectangle({
        x: orig.transform[4],
        y: orig.transform[5] - 1,
        width: item.original.width + 2,
        height: item.fontSize + 2,
        color: rgb(1, 1, 1),
      });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText(tempText, {
        x: orig.transform[4],
        y: orig.transform[5],
        size: item.fontSize,
        font, color: rgb(0, 0, 0)
      });
      const bytes = await doc.save();
      setPdfBytes(bytes.buffer);
      setEditingIndex(null);
      showStatus('success', 'Cambio aplicado.');
    } catch (err) { showStatus('error', 'Error al editar.'); }
    setLoading(false);
  };

  const getCoords = (e) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e) => {
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCoords(e);
    const ctx = signatureCanvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCoords(e);
    const ctx = signatureCanvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const prepareSignaturePlacement = () => {
    const sigCanvas = signatureCanvasRef.current;
    if (!sigCanvas) return;
    setSignatureImg(sigCanvas.toDataURL('image/png'));
    setMode('place_sign');
    setSigPos({ x: 50, y: 50 });
  };

  const finalizePlacement = async () => {
    if (!pdfBytes || !signatureImg) return;
    setLoading(true);
    try {
      const { PDFDocument } = window.PDFLib;
      const doc = await PDFDocument.load(pdfBytes.slice(0));
      const sigImage = await doc.embedPng(signatureImg);
      const page = doc.getPages()[currentPage - 1];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const canvas = canvasRef.current;
      const scaleX = pageWidth / (canvas.width / (window.devicePixelRatio || 1));
      const scaleY = pageHeight / (canvas.height / (window.devicePixelRatio || 1));
      page.drawImage(sigImage, {
        x: sigPos.x * scaleX,
        y: pageHeight - (sigPos.y * scaleY) - (sigSize.height * scaleY),
        width: sigSize.width * scaleX,
        height: sigSize.height * scaleY
      });
      const bytes = await doc.save();
      setPdfBytes(bytes.buffer);
      setMode('view');
      setSignatureImg(null);
      showStatus('success', 'Firma incrustada.');
    } catch (err) { showStatus('error', 'Error al firmar.'); }
    setLoading(false);
  };

  const handleGlobalMove = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    if (isDraggingSig) {
      setSigPos({ x: clientX - dragStartPos.current.x, y: clientY - dragStartPos.current.y });
    } else if (isResizingSig) {
      const deltaX = clientX - resizeStartPos.current.x;
      const deltaY = clientY - resizeStartPos.current.y;
      setSigSize({
        width: Math.max(50, resizeStartPos.current.w + deltaX),
        height: Math.max(25, resizeStartPos.current.h + deltaY)
      });
    }
  };

  // Función crítica de validación (Solo setIsPro aquí)
  const handleVerifyCode = () => {
    if (inputCode.trim().toUpperCase() === PRO_ACTIVATION_CODE) {
      setIsPro(true);
      setShowPayModal(false);
      showStatus('success', '¡Versión PRO activada!');
    } else {
      showStatus('error', 'Código incorrecto. Reintenta.');
    }
  };

  const handleWhatsAppNotify = () => {
    const message = encodeURIComponent("Hola Matías, acabo de pagar PDF Maya Pro. ¿Me mandás el código?");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank");
  };

  return (
    <div 
      className="min-h-screen flex flex-col bg-[#f8fafc] font-sans" 
      onMouseMove={handleGlobalMove} 
      onMouseUp={() => { setIsDraggingSig(false); setIsResizingSig(false); }}
      onTouchMove={handleGlobalMove}
      onTouchEnd={() => { setIsDraggingSig(false); setIsResizingSig(false); }}
    >
      {/* Header Matías Maya */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 md:px-12 py-4 flex items-center justify-between sticky top-0 z-[60] shadow-sm">
        <div className="flex items-center gap-3 text-slate-800">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-2 rounded-xl text-white shadow-lg"><Zap size={20} className="fill-current" /></div>
          <div className="flex flex-col">
            <span className="font-black text-sm md:text-base tracking-tighter uppercase leading-none">PDF MAYA PRO</span>
            {isPro && <span className="text-[8px] font-black text-emerald-500 tracking-widest uppercase mt-0.5 flex items-center gap-1"><Crown size={8}/> MIEMBRO PRO</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isPro && pdfBytes && (
            <button onClick={() => setShowPayModal(true)} className="bg-amber-50 text-amber-700 px-3 md:px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 border border-amber-200 active:scale-90 transition-all"><Crown size={12} /> Quitar Marca</button>
          )}
          {pdfBytes && (
            <button onClick={handleDownload} className="bg-slate-900 text-white px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-indigo-600 transition-all shadow-xl"><Download size={14} /> Exportar</button>
          )}
        </div>
      </nav>

      {!pdfBytes ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-white to-slate-50 text-center">
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                <div className="space-y-6 text-left">
                    <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"><ShieldCheck size={14} /> Edición 100% Privada</div>
                    <h1 className="text-4xl md:text-6xl font-black text-slate-900 leading-[1.1] tracking-tighter">Edita y Firma <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">profesionalmente.</span></h1>
                    <div className="flex flex-wrap gap-4 pt-4">
                        <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-wider bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-100"><Smartphone size={14} className="text-indigo-400" /> Móvil</div>
                        <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-wider bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-100"><Lock size={14} className="text-indigo-400" /> Encriptado</div>
                    </div>
                </div>
                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-[3rem] blur opacity-20 transition duration-1000"></div>
                    <div className="relative bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col items-center">
                        <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6"><Upload className="text-indigo-600" size={40} /></div>
                        <h3 className="text-xl font-black text-slate-900 mb-2">Comenzar ahora</h3>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8 text-center leading-loose">Sube tu PDF para editarlo</p>
                        <button onClick={() => fileInputRef.current.click()} className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-indigo-100 hover:bg-slate-900 transition-all">Subir Documento</button>
                    </div>
                </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
        </div>
      ) : (
        <>
          <div className="bg-white border-b border-slate-100 p-1 md:p-3 flex flex-col md:flex-row gap-2 sticky top-[73px] z-50 shadow-md mobile-header-container">
            <div className="flex items-center justify-between w-full md:w-auto gap-1">
               <div className="flex flex-1 md:flex-none gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                 <button onClick={() => setMode('edit')} className={`flex-1 md:px-6 py-2.5 rounded-xl font-black border transition-all mobile-btn-text flex items-center justify-center gap-1.5 ${mode === 'edit' ? 'bg-white text-indigo-600 border-indigo-100 shadow-sm' : 'text-slate-400 border-transparent hover:text-slate-600'}`}><Edit3 size={14} /> EDITAR</button>
                 <button onClick={() => setMode('sign')} className={`flex-1 md:px-6 py-2.5 rounded-xl font-black border transition-all mobile-btn-text flex items-center justify-center gap-1.5 ${mode === 'sign' ? 'bg-white text-indigo-600 border-indigo-100 shadow-sm' : 'text-slate-400 border-transparent hover:text-slate-600'}`}><PenTool size={14} /> FIRMAR</button>
               </div>
               {mode === 'place_sign' && (
                 <button onClick={finalizePlacement} className="px-4 py-2.5 rounded-xl font-black bg-emerald-500 text-white shadow-lg animate-pulse mobile-btn-text uppercase tracking-widest text-[9px]">Aplicar</button>
               )}
            </div>
            <div className="flex items-center justify-between w-full md:flex-1 md:justify-end gap-2">
              <div className="flex items-center bg-slate-900 text-white rounded-2xl p-1 shadow-lg">
                <button onClick={() => setCurrentPage(Math.max(1, currentPage-1))} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors"><ChevronLeft size={16}/></button>
                <span className="text-[9px] font-black px-2 min-w-[40px] text-center">{currentPage} / {numPages}</span>
                <button onClick={() => setCurrentPage(Math.min(numPages, currentPage+1))} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors"><ChevronRight size={16}/></button>
              </div>
              <div className="flex items-center bg-white rounded-2xl p-1 border border-slate-200 shadow-sm">
                <button onClick={() => setZoom(Math.max(0.5, zoom-0.1))} className="p-1.5 hover:bg-slate-50 rounded-xl text-slate-400"><ZoomOut size={16}/></button>
                <span className="text-[9px] font-black px-1.5 text-center text-slate-600">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(Math.min(3, zoom+0.1))} className="p-1.5 hover:bg-slate-50 rounded-xl text-slate-400"><ZoomIn size={16}/></button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-[#ebeef3] flex justify-center p-4 sm:p-10 custom-scrollbar relative">
            {!isPro && (
              <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center overflow-hidden opacity-10 select-none">
                <div className="grid grid-cols-2 gap-20 rotate-[-45deg] scale-150">
                  {Array(12).fill(0).map((_, i) => (<span key={i} className="text-5xl font-black text-slate-900 whitespace-nowrap uppercase">MAYA PRO</span>))}
                </div>
              </div>
            )}
            <div className="relative shadow-[0_30px_60px_-15px_rgba(0,0,0,0.2)] bg-white h-fit transition-transform duration-300 origin-top" style={{ width: canvasRef.current ? canvasRef.current.width / (window.devicePixelRatio || 1) : '100%' }}>
              <canvas ref={canvasRef} className="block w-full h-auto" />
              {mode === 'edit' && detectedText.map((item, i) => (
                <div key={i} className={`absolute border-2 border-transparent hover:border-indigo-400/30 hover:bg-indigo-500/5 cursor-text transition-all ${editingIndex === i ? 'border-indigo-600 bg-white/20 ring-[8px] ring-indigo-500/10 z-40 scale-[1.02]' : ''}`}
                  style={{ left: item.x - 2, top: item.y - 2, width: item.width + 12, height: item.height + 4 }}
                  onClick={(e) => { e.stopPropagation(); setEditingIndex(i); setTempText(item.str); }}>
                  {editingIndex === i && (
                    <div className="absolute -top-20 left-0 flex flex-col sm:flex-row gap-2 bg-white p-3 rounded-2xl shadow-2xl border border-slate-100 z-[100] min-w-[280px]" onClick={e => e.stopPropagation()}>
                      <div className="flex-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block text-left">Modificar Texto</label>
                        <input autoFocus className="w-full px-4 py-2.5 text-sm border-2 border-slate-50 rounded-xl outline-none focus:border-indigo-600 bg-slate-50 font-sans" value={tempText} onChange={e => setTempText(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveTextEdit()} />
                      </div>
                      <div className="flex items-end gap-2">
                        <button onClick={saveTextEdit} className="bg-indigo-600 text-white p-3 rounded-xl shadow-lg active:scale-90 transition-all"><CheckCircle2 size={18}/></button>
                        <button onClick={() => setEditingIndex(null)} className="bg-slate-100 text-slate-400 p-3 rounded-xl hover:bg-slate-200 transition-all"><X size={18}/></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {mode === 'place_sign' && signatureImg && (
                <div className="absolute cursor-move border-2 border-dashed border-indigo-500 z-40 bg-indigo-500/5 touch-none group"
                  style={{ left: sigPos.x, top: sigPos.y, width: sigSize.width, height: sigSize.height }}
                  onMouseDown={(e) => { e.preventDefault(); setIsDraggingSig(true); dragStartPos.current = { x: e.clientX - sigPos.x, y: e.clientY - sigPos.y }; }}
                  onTouchStart={(e) => { setIsDraggingSig(true); dragStartPos.current = { x: e.touches[0].clientX - sigPos.x, y: e.touches[0].clientY - sigPos.y }; }}
                >
                  <img src={signatureImg} className="w-full h-full object-contain pointer-events-none drop-shadow-md" alt="Firma" />
                  <div className="absolute -bottom-6 -right-6 w-12 h-12 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-xl border-2 border-indigo-100"
                    onMouseDown={(e) => { e.stopPropagation(); setIsResizingSig(true); resizeStartPos.current = { w: sigSize.width, h: sigSize.height, x: e.clientX, y: e.clientY }; }}
                    onTouchStart={(e) => { e.stopPropagation(); setIsResizingSig(true); resizeStartPos.current = { w: sigSize.width, h: sigSize.height, x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                  ><Maximize size={20} /></div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal de Pago Seguro */}
      {showPayModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-300 flex flex-col md:flex-row">
              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white text-center relative md:w-1/2 flex flex-col justify-center items-center">
                <button onClick={() => setShowPayModal(false)} className="absolute top-6 left-6 text-white/50 hover:text-white md:hidden"><X size={24} /></button>
                <div className="bg-white/20 w-16 h-16 rounded-3xl flex items-center justify-center mb-4 backdrop-blur-md"><Crown size={32} /></div>
                <h2 className="text-2xl font-black tracking-tighter uppercase leading-none text-white">Versión Pro</h2>
                <div className="mt-8 text-3xl font-black tracking-tighter text-white">$1.500 <span className="text-xs opacity-60">ARS</span></div>
              </div>
              <div className="p-8 flex-1 bg-white space-y-6 relative">
                <button onClick={() => setShowPayModal(false)} className="absolute top-4 right-4 text-slate-300 hover:text-slate-600 hidden md:block"><X size={20} /></button>
                <div className="space-y-4">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Paso 1: Realiza el pago</p>
                   {/* AQUÍ ELIMINÉ EL setIsPro(true) MALDITO */}
                   <button onClick={() => window.open("https://mpago.li/2cXEwL6", "_blank")} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-3 hover:bg-slate-900 active:scale-95 transition-all"><CreditCard size={18} /> Pagar ahora</button>
                   <button onClick={handleWhatsAppNotify} className="w-full bg-emerald-50 text-emerald-700 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-emerald-100 flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all"><MessageCircle size={16} /> Ya pagué, enviar aviso</button>
                </div>
                <div className="h-px bg-slate-100 w-full"></div>
                <div className="space-y-4">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Paso 2: Activa tu código</p>
                   <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input type="text" placeholder="Código..." value={inputCode} onChange={(e) => setInputCode(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold uppercase focus:border-indigo-600 outline-none" />
                   </div>
                   <button onClick={handleVerifyCode} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all">Validar Código</button>
                </div>
              </div>
           </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-xl z-[300] flex flex-col items-center justify-center gap-8">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="font-black text-[9px] uppercase tracking-[0.4em] text-indigo-900 animate-pulse">Procesando</span>
        </div>
      )}

      {status.message && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-4 rounded-[2rem] shadow-2xl border flex items-center gap-3 z-[250] animate-in slide-in-from-bottom-10 duration-500 bg-white text-slate-800 border-slate-100`}>
           {status.type === 'error' ? <AlertCircle size={18} className="text-red-500" /> : <CheckCircle2 size={18} className="text-emerald-500" />}
           <span className="font-black text-[10px] uppercase tracking-widest">{status.message}</span>
        </div>
      )}
    </div>
  );
};

export default App;