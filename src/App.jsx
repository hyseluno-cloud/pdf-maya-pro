import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Plus, Trash2, Download, Type, Upload, AlertCircle, 
  CheckCircle2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, 
  Edit3, MousePointer2, Save, ShieldCheck, Zap, Lock, PenTool, Move, Maximize
} from 'lucide-react';

// Cargador de librerías externas (PDF-Lib y PDF.js)
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
  
  // Estados de edición y firma
  const [detectedText, setDetectedText] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [tempText, setTempText] = useState("");
  const [mode, setMode] = useState('view'); // 'view', 'edit', 'sign', 'place_sign'

  // Firma Digital
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImg, setSignatureImg] = useState(null);
  const [sigPos, setSigPos] = useState({ x: 100, y: 100 });
  const [sigSize, setSigSize] = useState({ width: 150, height: 75 });
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
      const viewport = page.getViewport({ scale: zoom * 1.5 });
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      const textContent = await page.getTextContent();
      const items = textContent.items.map(item => {
        const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
        return {
          str: item.str,
          x: tx[4],
          y: tx[5] - ((item.height || 12) * zoom * 1.5),
          width: (item.width || 20) * zoom * 1.5,
          height: (item.height || 12) * zoom * 1.5,
          original: item
        };
      }).filter(item => item.str.trim().length > 0);
      setDetectedText(items);
    } catch (err) {
      showStatus('error', 'Error al procesar el PDF.');
    } finally { setLoading(false); }
  };

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 4000);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      setPdfBytes(arrayBuffer);
    } catch (err) { showStatus('error', 'Error al cargar archivo.'); }
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
        y: orig.transform[5] - 2,
        width: orig.width + 2,
        height: Math.sqrt(orig.transform[0]**2 + orig.transform[1]**2) + 2,
        color: rgb(1, 1, 1),
      });

      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText(tempText, {
        x: orig.transform[4],
        y: orig.transform[5],
        size: Math.sqrt(orig.transform[0]**2 + orig.transform[1]**2),
        font, color: rgb(0, 0, 0)
      });

      const bytes = await doc.save();
      setPdfBytes(bytes.buffer);
      setEditingIndex(null);
      showStatus('success', '¡Texto actualizado!');
    } catch (err) { showStatus('error', 'Error al guardar cambios.'); }
    setLoading(false);
  };

  // --- Lógica de Firma Digital ---
  const startDrawing = (e) => {
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const prepareSignaturePlacement = () => {
    const sigCanvas = signatureCanvasRef.current;
    setSignatureImg(sigCanvas.toDataURL('image/png'));
    setMode('place_sign');
    setSigPos({ x: 50, y: 50 });
    setSigSize({ width: 150, height: 75 });
  };

  // Drag & Move
  const handleStartDragSig = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSig(true);
    dragStartPos.current = {
      x: e.clientX - sigPos.x,
      y: e.clientY - sigPos.y
    };
  };

  // Resize
  const handleStartResizeSig = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingSig(true);
    resizeStartPos.current = {
      w: sigSize.width,
      h: sigSize.height,
      x: e.clientX,
      y: e.clientY
    };
  };

  const handleGlobalMouseMove = (e) => {
    if (isDraggingSig) {
      setSigPos({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    } else if (isResizingSig) {
      const deltaX = e.clientX - resizeStartPos.current.x;
      const deltaY = e.clientY - resizeStartPos.current.y;
      setSigSize({
        width: Math.max(40, resizeStartPos.current.w + deltaX),
        height: Math.max(20, resizeStartPos.current.h + deltaY)
      });
    }
  };

  const finalizeSignature = async () => {
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

      const pdfX = sigPos.x * scaleX;
      const pdfY = pageHeight - (sigPos.y * scaleY) - (sigSize.height * scaleY);

      page.drawImage(sigImage, {
        x: pdfX,
        y: pdfY,
        width: sigSize.width * scaleX,
        height: sigSize.height * scaleY
      });

      const bytes = await doc.save();
      setPdfBytes(bytes.buffer);
      setMode('view');
      setSignatureImg(null);
      showStatus('success', 'Firma incrustada correctamente.');
    } catch (err) { showStatus('error', 'Error al incrustar firma.'); }
    setLoading(false);
  };

  const downloadPdf = () => {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `PRO_MAYA_${fileName}`;
    link.click();
  };

  return (
    <div 
      className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden" 
      onMouseMove={handleGlobalMouseMove} 
      onMouseUp={() => { setIsDraggingSig(false); setIsResizingSig(false); }}
    >
      {/* Header */}
      <nav className="bg-white border-b px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => window.location.reload()}>
          <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg group-hover:rotate-12 transition-all">
            <Zap size={20} />
          </div>
          <span className="font-black text-xl tracking-tight uppercase">PDF <span className="text-indigo-600">MAYA</span> PRO</span>
        </div>
        {pdfBytes && (
          <button onClick={downloadPdf} className="bg-slate-900 text-white px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-indigo-600 shadow-lg transition-all active:scale-95">
            <Download size={16} /> Descargar Documento
          </button>
        )}
      </nav>

      {!pdfBytes ? (
        <div className="flex flex-col items-center pt-24 px-6 text-center max-w-4xl mx-auto">
          <div className="bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-8 animate-pulse">
            Sistemas de Gestión Matías Maya
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-8 leading-tight tracking-tighter">
            Edición Profesional de <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Documentos PDF</span>.
          </h1>
          <p className="text-slate-500 text-xl mb-12 max-w-2xl mx-auto leading-relaxed">
            Sin servidores. Sin cuotas. Edita texto y firma digitalmente tus archivos con total privacidad local.
          </p>
          <div 
            onClick={() => fileInputRef.current.click()} 
            className="bg-white border-4 border-dashed border-slate-200 rounded-[3rem] p-20 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/20 transition-all shadow-2xl group"
          >
             <div className="flex flex-col items-center">
                <div className="bg-indigo-600 text-white p-8 rounded-[2rem] mb-6 shadow-2xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <Upload size={40} />
                </div>
                <h3 className="text-3xl font-black text-slate-800">Cargar archivo</h3>
                <p className="text-slate-400 mt-2 font-bold uppercase text-xs tracking-widest italic tracking-widest">Busca en tu PC</p>
             </div>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
        </div>
      ) : (
        <div className="flex flex-col h-[calc(100vh-73px)]">
          {/* Toolbar */}
          <div className="bg-white border-b px-8 py-3.5 flex items-center justify-between shadow-sm overflow-x-auto gap-4">
            <div className="flex items-center gap-3 shrink-0">
               <button 
                onClick={() => setMode('edit')} 
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black border transition-all flex items-center gap-2 ${mode === 'edit' ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200 shadow-xl' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200'}`}
               >
                 <Edit3 size={14}/> EDITAR TEXTO
               </button>
               <button 
                onClick={() => setMode('sign')} 
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black border transition-all flex items-center gap-2 ${mode === 'sign' ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200 shadow-xl' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200'}`}
               >
                 <PenTool size={14}/> FIRMAR
               </button>
               {mode === 'place_sign' && (
                 <button onClick={finalizeSignature} className="px-5 py-2.5 rounded-xl text-[10px] font-black bg-emerald-600 text-white border border-emerald-600 shadow-emerald-200 shadow-xl flex items-center gap-2 animate-pulse">
                   <CheckCircle2 size={14}/> CONFIRMAR POSICIÓN
                 </button>
               )}
            </div>
            
            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center bg-slate-100 rounded-xl p-1.5 border border-slate-200 shadow-inner">
                <button onClick={() => setCurrentPage(Math.max(1, currentPage-1))} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all active:scale-90"><ChevronLeft size={16}/></button>
                <span className="px-5 text-[11px] font-black text-slate-600">{currentPage} / {numPages}</span>
                <button onClick={() => setCurrentPage(Math.min(numPages, currentPage+1))} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all active:scale-90"><ChevronRight size={16}/></button>
              </div>
              <div className="flex items-center bg-slate-100 rounded-xl p-1.5 border border-slate-200 shadow-inner">
                <button onClick={() => setZoom(Math.max(0.5, zoom-0.2))} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all active:scale-90"><ZoomOut size={16}/></button>
                <span className="px-3 text-[10px] font-black text-slate-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(Math.min(3, zoom+0.2))} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all active:scale-90"><ZoomIn size={16}/></button>
              </div>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 overflow-auto p-12 bg-slate-200 flex justify-center custom-scrollbar">
            <div className="relative shadow-2xl bg-white origin-top" style={{ width: canvasRef.current ? canvasRef.current.width / (window.devicePixelRatio || 1) : 600 }}>
              <canvas ref={canvasRef} className="block w-full h-auto" />
              
              {/* Overlay: Edición de Texto */}
              {mode === 'edit' && (
                <div className="absolute inset-0 pointer-events-none">
                  {detectedText.map((item, i) => (
                    <div 
                      key={i} 
                      className={`absolute pointer-events-auto border border-transparent hover:border-indigo-400 hover:bg-indigo-500/10 cursor-text transition-all ${editingIndex === i ? 'border-indigo-600 bg-white ring-8 ring-indigo-500/20 z-50 rounded-sm shadow-2xl' : ''}`}
                      style={{ left: item.x, top: item.y, width: item.width, height: item.height }}
                      onClick={(e) => { e.stopPropagation(); setEditingIndex(i); setTempText(item.str); }}
                    >
                      {editingIndex === i && (
                        <div className="absolute -top-16 left-0 flex gap-2 bg-white p-3 rounded-2xl shadow-2xl border border-slate-100 z-[60] min-w-[350px]" onClick={e => e.stopPropagation()}>
                          <input 
                            autoFocus 
                            className="flex-1 px-4 py-2 text-sm font-bold bg-slate-50 border-none outline-none rounded-xl focus:ring-2 focus:ring-indigo-500" 
                            value={tempText} 
                            onChange={e => setTempText(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && saveTextEdit()} 
                          />
                          <button onClick={saveTextEdit} className="bg-emerald-500 text-white p-2.5 rounded-xl hover:bg-emerald-600 transition-all shadow-lg active:scale-90"><CheckCircle2 size={18}/></button>
                          <button onClick={() => setEditingIndex(null)} className="bg-slate-100 p-2.5 rounded-xl text-slate-400 hover:bg-slate-200 transition-all active:scale-90"><Plus className="rotate-45" size={18}/></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Overlay: Mover y Redimensionar Firma */}
              {mode === 'place_sign' && signatureImg && (
                <div 
                  className={`absolute cursor-move border-2 border-dashed border-indigo-600 bg-indigo-50/20 z-[70] ${isDraggingSig ? 'opacity-80' : ''} transition-opacity`}
                  style={{ left: sigPos.x, top: sigPos.y, width: sigSize.width, height: sigSize.height }}
                  onMouseDown={handleStartDragSig}
                >
                  <img src={signatureImg} alt="firma" className="w-full h-full object-contain pointer-events-none" />
                  
                  {/* Handle de Redimensión */}
                  <div 
                    className="absolute -bottom-2 -right-2 w-6 h-6 bg-indigo-600 rounded-full cursor-nwse-resize flex items-center justify-center text-white shadow-lg hover:scale-125 transition-transform"
                    onMouseDown={handleStartResizeSig}
                  >
                    <Maximize size={12} />
                  </div>

                  <div className="absolute -top-6 left-0 bg-indigo-600 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1 shadow-md">
                    <Move size={8}/> Arrastrar para ubicar / Esquina para tamaño
                  </div>
                </div>
              )}

              {/* Pad de Dibujo de Firma */}
              {mode === 'sign' && (
                <div className="absolute inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-8">
                   <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-indigo-100 w-full max-w-md">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="font-black text-xs tracking-widest text-slate-400 uppercase">Dibujar Firma</h4>
                        <button onClick={() => setMode('view')} className="text-slate-400 hover:text-red-500 transition-colors"><Plus className="rotate-45" size={24}/></button>
                      </div>
                      <div className="bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] overflow-hidden shadow-inner cursor-crosshair">
                        <canvas 
                          ref={signatureCanvasRef} 
                          width={350} 
                          height={200} 
                          className="w-full h-auto block" 
                          onMouseDown={startDrawing} 
                          onMouseMove={draw} 
                          onMouseUp={() => setIsDrawing(false)}
                          onMouseLeave={() => setIsDrawing(false)}
                        />
                      </div>
                      <div className="flex gap-3 mt-8">
                        <button onClick={prepareSignaturePlacement} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-95">Siguiente Paso</button>
                        <button 
                          onClick={() => {
                            const ctx = signatureCanvasRef.current.getContext('2d');
                            ctx.clearRect(0, 0, 350, 200);
                          }} 
                          className="px-5 bg-slate-100 rounded-2xl text-slate-500 hover:bg-slate-200 transition-all"
                        >
                          <Trash2 size={20}/>
                        </button>
                      </div>
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-[110] flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-6"></div>
          <span className="font-black text-indigo-900 text-[10px] tracking-[0.3em] uppercase animate-pulse">Procesando...</span>
        </div>
      )}

      {/* Toast Notification */}
      {status.message && (
        <div className={`fixed bottom-8 right-8 p-5 rounded-2xl shadow-2xl border flex items-center gap-4 z-[120] animate-in slide-in-from-bottom-5 duration-300 ${status.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
           <div className={`p-2 rounded-full ${status.type === 'error' ? 'bg-red-100' : 'bg-emerald-100'}`}>
             {status.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}
           </div>
           <span className="font-black text-xs uppercase tracking-widest">{status.message}</span>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};

export default App;