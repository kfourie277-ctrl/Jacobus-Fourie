import React, { useState } from 'react';
import { JobCard, Part, JobNote } from '../types';
import { format } from 'date-fns';
import { X, Printer, CheckCircle2, AlertCircle, Wrench, ShieldCheck, Box, HelpCircle, Download, Loader2, Save, Trash2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { doc, updateDoc, deleteDoc, query, where, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import Logo from './Logo';

interface InvoiceSummaryProps {
  jobCard: JobCard;
  parts: Part[];
  jobNotes?: JobNote[];
  onClose: () => void;
}

export default function InvoiceSummary({ jobCard, parts, jobNotes = [], onClose }: InvoiceSummaryProps) {
  const [isEditingPricing, setIsEditingPricing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteInvoice = async () => {
    if (!window.confirm(`Are you absolutely certain you want to permanently delete Job Card & Invoice #${jobCard.jobCardNo}? All recorded parts and work logs will be purged.`)) return;
    
    setDeleting(true);
    try {
      // 1. Delete associated parts
      const partsQ = query(collection(db, 'parts'), where('jobCardId', '==', jobCard.id));
      const partsSnap = await getDocs(partsQ);
      const batch = writeBatch(db);
      
      partsSnap.forEach(p => batch.delete(p.ref));
      
      // 2. Delete the main job card itself
      batch.delete(doc(db, 'jobCards', jobCard.id));
      await batch.commit();

      // 3. Sync delete to external V2 app via public proxy endpoint
      fetch('/api/sync-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'DELETE_JOB_CARD', payload: { id: jobCard.id } })
      }).catch(err => console.error("External sync failed", err));

      alert(`Job Card #${jobCard.jobCardNo} deleted successfully.`);
      onClose();
      // Instantly reload to update lists
      window.location.reload();
    } catch (err) {
      console.error("Error deleting job card:", err);
      alert("Failed to delete Job Card & Invoice. Please check permissions and try again.");
    } finally {
      setDeleting(false);
    }
  };

  // Financial calculations
  const partsSubtotal = parts.reduce((sum, part) => sum + ((part.price || 0) * (part.quantity || 1)), 0);
  const labourAmount = jobCard.workDetails?.authorisedCost || jobCard.workDetails?.estimatedCost || 0;
  
  // South African VAT is 15%
  const vatRate = 0.15;
  const subtotalBeforeVat = partsSubtotal + labourAmount;
  const vatAmount = subtotalBeforeVat * vatRate;
  const grandTotal = subtotalBeforeVat + vatAmount;

  const invoiceDate = jobCard.createdAt?.toDate 
    ? format(jobCard.createdAt.toDate(), 'PPP') 
    : format(new Date(), 'PPP');

  const [exportingPDF, setExportingPDF] = useState(false);

  const updatePartPrice = async (partId: string, value: number) => {
    try {
      await updateDoc(doc(db, 'parts', partId), { price: value });
    } catch (err) {
      console.error("Error updating price:", err);
    }
  };

  const updatePartQty = async (partId: string, value: number) => {
    try {
      if (value < 1) value = 1;
      await updateDoc(doc(db, 'parts', partId), { quantity: value });
    } catch (err) {
      console.error("Error updating quantity:", err);
    }
  };

  const updateLabourAmount = async (value: number) => {
    try {
      await updateDoc(doc(db, 'jobCards', jobCard.id), {
        'workDetails.authorisedCost': value,
        'workDetails.estimatedCost': value
      });
    } catch (err) {
      console.error("Error updating labor:", err);
    }
  };

  const printInvoice = () => {
    window.print();
  };

  const exportPDF = async () => {
    const element = document.getElementById('printable-invoice-content');
    if (!element) return;
    
    try {
      setExportingPDF(true);
      
      // Selectively scale rendering for pristine print clarity
      const canvas = await html2canvas(element, {
        scale: 2.2, // Clean crisp scaling
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 1024, // Consistent grid widths for tabular layouts
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 210; // Standard A4 width in mm
      const pageHeight = 297; // Standard A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      // First page
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
      
      // Stagger multi-page items gracefully
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }
      
      pdf.save(`ERET-Invoice-No-${jobCard.jobCardNo}.pdf`);
    } catch (error) {
      console.error('Error generating clean PDF file:', error);
    } finally {
      setExportingPDF(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-md overflow-y-auto flex items-center justify-center p-4 sm:p-6 md:p-10 print:static print:bg-white print:p-0 print:backdrop-blur-none">
      
      {/* Absolute controls for preview screen */}
      <div className="fixed top-4 right-4 flex items-center gap-3 z-[110] print:hidden">
        <button
          onClick={exportPDF}
          disabled={exportingPDF}
          className={`flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm rounded-xl tracking-wide shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer ${exportingPDF ? 'opacity-80 cursor-not-allowed' : ''}`}
        >
          {exportingPDF ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-red-500" />
              <span>Generating PDF...</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4 text-[#cc0000]" />
              <span>Download PDF File</span>
            </>
          )}
        </button>
        <button
          onClick={printInvoice}
          disabled={exportingPDF}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm rounded-xl tracking-wide shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <Printer className="h-4 w-4" />
          <span>Print / Save as PDF</span>
        </button>
        <button
          onClick={() => setIsEditingPricing(!isEditingPricing)}
          disabled={exportingPDF}
          className={`flex items-center gap-2 px-5 py-2.5 ${isEditingPricing ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#cc0000] hover:bg-black'} text-white font-extrabold text-sm rounded-xl tracking-wide shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer`}
          title={isEditingPricing ? "Lock and apply pricing to database" : "Unlock prices and labour to edit them manually"}
        >
          {isEditingPricing ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>Lock Prices</span>
            </>
          ) : (
            <>
              <Wrench className="h-4 w-4" />
              <span>Edit Costs &amp; Prices</span>
            </>
          )}
        </button>
        <button
          onClick={handleDeleteInvoice}
          disabled={exportingPDF || deleting}
          className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm rounded-xl tracking-wide shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
          title="Delete this entire Job Card and Invoice permanently."
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin text-red-100" />
          ) : (
            <Trash2 className="h-4 w-4 text-red-100" />
          )}
          <span>Delete Invoice</span>
        </button>
        <button
          onClick={onClose}
          disabled={exportingPDF}
          className="p-2.5 bg-slate-900/80 hover:bg-red-600 border border-slate-800 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer shadow-lg"
          title="Close Preview"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Invoice Sheet Wrapper */}
      <div className="w-full max-w-4xl bg-white text-slate-900 rounded-3xl shadow-2xl relative overflow-hidden my-8 print:my-0 print:shadow-none print:rounded-none print:static print:max-w-none print:bg-white flex flex-col">
        
        {/* Decorative solid red line at the top (Screen Only) */}
        <div className="h-1.5 bg-gradient-to-r from-[#cc0000] via-red-500 to-slate-900 w-full print:hidden" />

        {/* Invoice Printable Area */}
        <div className="p-8 md:p-12 print:p-0 flex-1 space-y-8" id="printable-invoice-content">
          
          {/* 1. BRAND HEADER & TAX INVOICE BLOCK */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-8">
            <div className="space-y-4 max-w-md">
              <Logo className="h-14" />
              <div className="text-[11px] text-slate-500 leading-relaxed font-medium">
                <p className="font-extrabold text-slate-700">Eastrand Engine &amp; Turbo (Pty) Ltd</p>
                <p>Company Registration: 2018/382914/07</p>
                <p>Address: Spartan, Kempton Park, Gauteng, 1619</p>
                <p>Ph: 065 925 3612 | Email: service@eastrandengine.co.za</p>
              </div>
            </div>

            <div className="text-left md:text-right space-y-2.5 shrink-0 self-stretch md:self-auto flex flex-col justify-between md:items-end">
              <div>
                <h1 className="text-2xl font-black text-slate-950 tracking-tight leading-none uppercase">Tax Invoice Summary</h1>
                <p className="text-xs text-slate-400 font-bold tracking-widest mt-1">FOR OFFICE &amp; CLIENT RECORDS</p>
              </div>
              <div className="space-y-1 font-mono text-xs text-slate-600 bg-slate-50 border border-slate-100 p-3 rounded-xl md:text-right">
                <div>JOB NO: <span className="font-black text-slate-950">#{jobCard.jobCardNo}</span></div>
                <div>DATE: <span className="font-bold text-slate-800">{invoiceDate}</span></div>
                <div>ACCESS CODE: <span className="font-bold text-red-600 tracking-wider font-mono">{jobCard.customerCode}</span></div>
                <div className="pt-1.5 flex items-center md:justify-end gap-1.5 font-sans">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">STATUS:</span>
                  <span className="px-2 py-0.5 bg-[#cc0000] text-white text-[9px] font-black rounded-md uppercase tracking-wide">
                    {jobCard.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. CLIENT VS VEHICLE DATA SECTION */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            
            {/* Client billing block */}
            <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl print:bg-transparent print:border-slate-200">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3.5 border-b border-slate-200 pb-1.5 flex items-center gap-2">
                <span className="w-1.5 h-3 bg-[#cc0000] rounded-full inline-block" />
                Invoiced Client
              </h3>
              <div className="space-y-2 text-xs leading-relaxed text-slate-600">
                {jobCard.clientInfo?.companyName && (
                  <div className="font-black text-sm text-slate-900">{jobCard.clientInfo.companyName}</div>
                )}
                <div className="font-bold text-slate-800">
                  {jobCard.clientInfo?.firstName || 'Walk-in'} {jobCard.clientInfo?.surname || 'Client'}
                </div>
                {jobCard.clientInfo?.email && (
                  <div>Email: <span className="font-semibold text-slate-700 select-all">{jobCard.clientInfo.email}</span></div>
                )}
                {(jobCard.clientInfo?.tel || jobCard.clientInfo?.cell) && (
                  <div className="font-semibold text-slate-700">
                    Ph: {jobCard.clientInfo.tel || ''} {jobCard.clientInfo.cell ? `| ${jobCard.clientInfo.cell}` : ''}
                  </div>
                )}
                {jobCard.clientInfo?.address && (
                  <div className="pt-1.5 mt-1 border-t border-slate-200/60 font-medium text-[11px] italic">
                    {jobCard.clientInfo.address}
                  </div>
                )}
              </div>
            </div>

            {/* Vehicle spec block */}
            <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl print:bg-transparent print:border-slate-200">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3.5 border-b border-slate-200 pb-1.5 flex items-center gap-2">
                <span className="w-1.5 h-3 bg-slate-950 rounded-full inline-block" />
                Vehicle Information
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs text-slate-600 font-medium">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Make / Model</span>
                  <span className="font-extrabold text-slate-900">
                    {jobCard.vehicleDetails?.make} {jobCard.vehicleDetails?.model}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">License Plates</span>
                  <span className="font-mono font-bold text-[#cc0000] uppercase tracking-wider bg-white px-2 py-0.5 border border-slate-200 rounded-md inline-block mt-0.5 print:bg-transparent">
                    {jobCard.vehicleDetails?.registrationNo || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Specifications</span>
                  <span className="text-slate-800 font-semibold">
                    {jobCard.vehicleDetails?.year || 'N/A'} | {jobCard.vehicleDetails?.color || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Fuel / Transmission</span>
                  <span className="text-slate-800 font-semibold">
                    {jobCard.vehicleDetails?.fuelType || 'Petrol'} ({jobCard.vehicleDetails?.transmission || 'Automatic'})
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Odometer In</span>
                  <span className="text-slate-800 font-mono font-bold">{jobCard.vehicleDetails?.odometerIn ? `${Number(jobCard.vehicleDetails.odometerIn).toLocaleString()} km` : 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Odometer Out</span>
                  <span className="text-slate-800 font-mono font-bold">{jobCard.vehicleDetails?.odometerOut ? `${Number(jobCard.vehicleDetails.odometerOut).toLocaleString()} km` : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. TECHNICAL NOTES & DIALOGS */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-1 border-dashed">
              <span className="w-1.5 h-3 bg-[#cc0000] rounded-full inline-block" />
              Service Notes & Technical Summary
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {jobCard.workDetails?.workRequested && (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs print:bg-transparent print:border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Customer Work Request</span>
                  <p className="text-slate-600 italic font-medium leading-relaxed">
                    "{jobCard.workDetails.workRequested}"
                  </p>
                </div>
              )}

              {jobCard.workDetails?.workshopNotes && (
                <div className="p-4 bg-red-50/20 border border-red-100/50 rounded-xl text-xs print:bg-transparent print:border-slate-200">
                  <span className="text-[9px] font-black text-[#cc0000] uppercase tracking-wider block mb-1">Chief Mechanic Summary</span>
                  <p className="text-slate-700 font-semibold leading-relaxed">
                    {jobCard.workDetails.workshopNotes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 4. PARTS INVENTORY GRID */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-1 border-dashed">
              <span className="w-1.5 h-3 bg-slate-900 rounded-full inline-block" />
              Used Spare Parts & Accessories Inventory
            </h3>
            
            <div className="border border-slate-200 rounded-2xl overflow-hidden print:border-slate-300">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-black text-[10px] uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">Spares / Part Record</th>
                    <th className="py-3 px-4">Technician Class</th>
                    <th className="py-3 px-4 text-center w-20">Qty</th>
                    <th className="py-3 px-4 text-right w-36">Unit Cost (R)</th>
                    <th className="py-3 px-4 text-right w-40">Line Total (R)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parts.length > 0 ? (
                    parts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{p.name}</div>
                          {p.description && <div className="text-[10px] text-slate-400 mt-0.5">{p.description}</div>}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-medium">
                          {p.assignedTechnicianName || 'Workshop Staff'}
                        </td>
                        <td className="py-2 px-4 text-center font-bold text-slate-700 font-mono">
                          {isEditingPricing ? (
                            <input 
                              type="number"
                              min={1}
                              defaultValue={p.quantity || 1}
                              onBlur={(e) => updatePartQty(p.id, parseInt(e.target.value) || 1)}
                              className="w-14 px-1.5 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-red-600 outline-none font-bold text-xs"
                            />
                          ) : (
                            p.quantity || 1
                          )}
                        </td>
                        <td className="py-2 px-4 text-right font-semibold text-slate-700 font-mono">
                          {isEditingPricing ? (
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-slate-400 font-sans">R</span>
                              <input 
                                type="number"
                                min={0}
                                step="any"
                                defaultValue={p.price || 0}
                                onBlur={(e) => updatePartPrice(p.id, parseFloat(e.target.value) || 0)}
                                className="w-24 px-1.5 py-1 text-right bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-red-600 outline-none font-mono font-bold text-xs animate-[pulse_1.5s_infinite]"
                              />
                            </div>
                          ) : (
                            `R ${(p.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          )}
                        </td>
                        <td className="py-2 px-4 text-right font-extrabold text-slate-900 font-mono">
                          R {((p.price || 0) * (p.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-bold italic bg-slate-50/10">
                        No custom spare parts checked on this job card.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. WORKSHOP DIAGNOSTIC CHECKLIST SUMMARY */}
          {jobCard.checklist && jobCard.checklist.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-1 border-dashed">
                <span className="w-1.5 h-3 bg-[#cc0000] rounded-full inline-block" />
                Workshop Diagnostic Checklist
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {jobCard.checklist.map((item) => (
                  <div 
                    key={item.id} 
                    className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs transition-colors ${
                      item.completed 
                        ? 'bg-green-50/40 border-green-200 text-slate-700' 
                        : 'bg-slate-50/20 border-slate-100 text-slate-400'
                    }`}
                  >
                    {item.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className={`font-bold ${item.completed ? 'text-slate-800' : 'text-slate-400'}`}>
                        {item.task}
                      </div>
                      {item.completed && item.completedBy && (
                        <div className="text-[9px] text-green-700 font-semibold mt-0.5">
                          done by {item.completedBy}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. LABOR ESTIMATES & TOTAL ACCOUNTING SUMMARIES */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 pt-4 border-t border-slate-200">
            <div className="text-[11px] text-slate-400 font-medium leading-relaxed max-w-md">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-1">Financial Terms &amp; Declarations</h4>
              <p>1. This summary is calculated with South African standard VAT rate at 15%.</p>
              <p>2. Spare parts totals are verified against the stock control interface of ERET.</p>
              <p>3. Estimates and authorizations are logged securely with Firestore signatures.</p>
              <p className="mt-1 font-bold text-[#cc0000]">Thank you for choosing Eastrand Engine &amp; Turbo Performance Tuning!</p>
            </div>

            <div className="w-full md:w-80 shrink-0 space-y-2 p-5 bg-slate-900 text-white rounded-2xl print:bg-transparent print:border print:border-slate-300 print:text-black">
              <div className="flex justify-between items-center text-xs font-bold text-slate-400 print:text-slate-500">
                <span>Spare Parts Subtotal:</span>
                <span className="font-mono text-white print:text-slate-800">
                  R {partsSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-xs font-bold text-slate-400 print:text-slate-500">
                <span>Workshop Labour (Agreed):</span>
                <span className="font-mono text-white print:text-slate-800">
                  {isEditingPricing ? (
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-slate-400 font-sans">R</span>
                      <input 
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={labourAmount}
                        onBlur={(e) => updateLabourAmount(parseFloat(e.target.value) || 0)}
                        className="w-24 px-1.5 py-0.5 text-right bg-slate-800 border border-slate-700 rounded-md focus:ring-1 focus:ring-red-500 font-mono font-bold text-xs text-white outline-none animate-[pulse_1.5s_infinite]"
                      />
                    </div>
                  ) : (
                    `R ${labourAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )}
                </span>
              </div>

              <div className="h-px bg-slate-750 my-2 print:bg-slate-300" />

              <div className="flex justify-between items-center text-xs font-bold text-slate-400 print:text-slate-500">
                <span>Net Subtotal:</span>
                <span className="font-mono text-white print:text-slate-800">
                  R {subtotalBeforeVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs font-bold text-slate-400 print:text-slate-500">
                <span>Value Added Tax (15%):</span>
                <span className="font-mono text-white print:text-slate-800">
                  R {vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="h-px bg-slate-750 my-2 print:bg-slate-300" />

              <div className="flex justify-between items-center pt-1 block">
                <span className="text-sm font-black text-white uppercase tracking-wider print:text-slate-950">Grand Total:</span>
                <span className="text-xl font-black text-red-500 font-mono tracking-tight print:text-[#cc0000]">
                  R {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* 7. SIGNATURE VALIDATIONS ZONE */}
          <div className="grid grid-cols-2 gap-8 pt-10 border-t border-dashed border-slate-200 print:pt-12">
            <div>
              <div className="h-px bg-slate-300 max-w-[240px] mb-2" />
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Workshop Manager Seal</div>
              <div className="text-[9px] text-slate-400 mt-1">Authorised Signatory of Eastrand Engine &amp; Turbo</div>
            </div>

            <div className="text-right flex flex-col items-end">
              <div className="h-px bg-slate-300 w-full max-w-[240px] mb-2" />
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Invoiced Client Signature</div>
              <div className="text-[9px] text-slate-400 mt-1">Acceptance of repairs &amp; parts checklist</div>
            </div>
          </div>

        </div>

        {/* Footer info (Screen Only) */}
        <div className="bg-slate-100/65 px-8 py-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-widest font-black print:hidden">
          <span>EASTRAND PORTAL SYSTEM</span>
          <span>© {new Date().getFullYear()}</span>
        </div>

      </div>

    </div>
  );
}
