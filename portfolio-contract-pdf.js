/* PDF-LIB 1.17.1; AcroForm values remain editable. The signature is a saved image, not a certificate signature. */
(function(root){
 'use strict';
 async function build(sale,lib=root.PDFLib){
  if(sale.contract_snapshot?.layout==='document-v1')return (root.PortfolioContractDocumentPDF||(typeof require==='function'?require('./portfolio-contract-document-pdf.js'):null)).build(sale,lib);
  if(!lib)throw Error('PDF tools could not load. Refresh while online and try again.');
  const {PDFDocument,StandardFonts,rgb}=lib,doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),form=doc.getForm();
  const snap=sale.contract_snapshot;if(!snap)throw Error('This older sale has no saved contract.');
  const ink=rgb(.13,.22,.18),muted=rgb(.40,.44,.42),line=rgb(.83,.86,.84);let page,y;
  const clean=value=>Array.from(String(value??'').replace(/\t/g,'  ').replace(/[\u2010-\u2015]/g,'-')).map(c=>{if(c==='\n')return c;try{font.encodeText(c);return c}catch{return '?'}}).join('');
  function text(value,x,top,size=10,weight=font,color=ink){page.drawText(clean(value),{x,y:top,size,font:weight,color})}
  function next(){page=doc.addPage([595.28,841.89]);y=756;text('ESQUILIANO CONSULTING & BOOKKEEPING',42,800,11,bold);text('SERVICE CONTRACT  /  '+sale.service,42,780,10);page.drawLine({start:{x:42,y:768},end:{x:553,y:768},thickness:.7,color:line})}
  function need(height){if(y-height<64)next()}
  function wrap(value,width,size=10){const out=[];for(const para of clean(value).split('\n')){let current='';for(const token of para.split(/\s+/)){if(!token)continue;if(font.widthOfTextAtSize((current?current+' ':'')+token,size)<=width){current+=(current?' ':'')+token;continue}if(current){out.push(current);current=''}for(const char of token){if(font.widthOfTextAtSize(current+char,size)>width){out.push(current);current=''}current+=char}}out.push(current)}return out}
  function heading(value){need(44);text(value,42,y,12,bold);y-=23}
  function paragraph(value){for(const row of wrap(value,511)){need(16);text(row,42,y);y-=15}y-=10}
  function input(name,label,value,x=42,width=511){
   const lines=wrap(value,width-16),chunks=[];for(let i=0;i<lines.length;i+=28)chunks.push(lines.slice(i,i+28));if(!chunks.length)chunks.push(['']);
   chunks.forEach((rows,index)=>{const height=Math.max(29,rows.length*14+14);need(height+28);text(label+(index?' (continued)':''),x,y,9,bold,muted);y-=height+8;const f=form.createTextField(name+(chunks.length>1?'_'+(index+1):''));f.enableMultiline();f.setText(rows.join('\n'));f.addToPage(page,{x,y,width,height,borderWidth:.5,borderColor:line,backgroundColor:rgb(1,1,1),textColor:ink,font});f.setFontSize(10);y-=18});
  }
  function pair(a,b){need(Math.max(wrap(a[2],229).length,wrap(b[2],229).length)*14+60);const start=y;input(...a,42,245);const end=y;y=start;input(...b,308,245);y=Math.min(y,end)}
  next();heading(snap.title);paragraph('Template version '+snap.version+' | Saved '+String(sale.created_at||snap.confirmed_at||'').slice(0,10));
  pair(['customer_name','Customer name',sale.customer_name],['business','Business / organization',sale.business]);
  pair(['email','Email',sale.email],['phone','Phone',sale.phone]);
  pair(['payment_method','Payment method',sale.payment_method],['service','Services provided',sale.service]);
  const bank=snap.bank||{};paragraph((bank.name||'Atlantic Bank')+' | '+(bank.account_name||'Jose Armando Esquiliano')+'\nChecking account '+(bank.account_number||'211747902')+' | Belize (BZD)');
  pair(['amount','Amount charged',Number(sale.amount).toFixed(2)],['currency','Currency',sale.currency]);
  pair(['sale_date','Sale date',sale.sale_date],['contract_date','Contract date',sale.contract_date]);
  heading('Agreement template');paragraph(snap.body);
  heading('Agreed work');for(const [key,label] of [['scope','Scope of work'],['deliverables','Deliverables'],['timeline','Timeline / milestones'],['payment_terms','Payment arrangements'],['notes','Additional notes']])input(key,label,snap.fields?.[key]||'');
  need(190);heading('Signatures');text('Staff signature saved with this record',42,y,9,bold,muted);y-=70;
  if(snap.signature){const image=await doc.embedPng(snap.signature),dim=image.scaleToFit(230,58);page.drawImage(image,{x:42,y:y+4,width:dim.width,height:dim.height})}
  text(snap.signer_name||'',42,y-12,10,bold);text('Confirmed '+String(snap.confirmed_at||'').slice(0,10),308,y-12,9);y-=44;
  input('customer_signature','Customer signature / name (complete on the downloaded copy)','');
  for(const [i,p] of doc.getPages().entries()){p.drawLine({start:{x:42,y:48},end:{x:553,y:48},thickness:.5,color:line});p.drawText(clean('Reference '+sale.id),{x:42,y:33,size:7,font,color:muted});p.drawText((i+1)+' / '+doc.getPageCount(),{x:518,y:33,size:8,font,color:muted})}
  form.updateFieldAppearances(font);doc.setTitle(sale.service+' contract - '+sale.customer_name);doc.setAuthor('Esquiliano Consulting & Bookkeeping');doc.setSubject('Saved service contract; editable PDF copy');return doc.save();
 }
 async function download(sale){const bytes=await build(sale),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download='Contract-'+sale.customer_name.replace(/[^A-Za-z0-9_-]/g,'-')+'-'+sale.sale_date+'.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 root.PortfolioContractPDF={build,download};if(typeof module==='object')module.exports={build};
})(typeof window==='object'?window:globalThis);
