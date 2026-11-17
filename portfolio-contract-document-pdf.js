(function(root){
 'use strict';
 async function build(sale,lib=root.PDFLib){
  const {PDFDocument,StandardFonts,rgb}=lib,doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),form=doc.getForm(),snap=sale.contract_snapshot;
  const ink=rgb(.12,.19,.15),muted=rgb(.43,.47,.44),line=rgb(.66,.73,.68);let page,x=48,y=735;
  const clean=value=>Array.from(String(value??'').replace(/[\u2010-\u2015]/g,'-')).map(c=>{if(c==='\n')return c;try{font.encodeText(c);return c}catch{return '?'}}).join('');
  const values={...snap.fields,customer_name:sale.customer_name,business:sale.business,email:sale.email,phone:sale.phone,service:sale.service,amount:sale.currency+' '+Number(sale.amount).toFixed(2),contract_date:sale.contract_date,sale_date:sale.sale_date,staff_name:snap.signer_name,payment_method:sale.payment_method};
  const widths={client_address:250,reference:155,start_date:100,end_date:100,customer_name:170,business:170,email:180,phone:110,amount:90,contract_date:100,sale_date:100,staff_name:150,payment_method:45,service:180};
  function draw(text,px,py,size=10,weight=font,color=ink){page.drawText(clean(text),{x:px,y:py,size,font:weight,color})}
  function next(){page=doc.addPage([595.28,841.89]);x=48;y=735;draw('ESQUILIANO',48,796,18,bold);draw('CONSULTING & BOOKKEEPING',48,779,8);draw(sale.service.toUpperCase()+' SERVICE CONTRACT',48,756,11,bold);page.drawLine({start:{x:48,y:747},end:{x:547,y:747},thickness:.7,color:line})}
  function newline(){x=48;y-=21;if(y<74)next()}
  function word(text){const width=font.widthOfTextAtSize(clean(text),10);if(x+width>547&&x>48)newline();if(width>499){for(const c of text)word(c);return}draw(text,x,y);x+=width}
  function plain(text){for(const token of text.match(/\n|[^\S\n]+|[^\s]+/g)||[]){if(token==='\n')newline();else if(/^\s+$/.test(token)){if(x>48)x+=font.widthOfTextAtSize(' ',10)}else word(token)}}
  function blank(key){if(!(key in widths)){plain('________________');return}const value=clean(values[key]||''),measured=font.widthOfTextAtSize(value,10),width=Math.min(499,Math.max(widths[key],measured+12)),rows=Math.max(1,Math.ceil((measured+12)/499)),height=rows*15+5;if(x+width>547&&x>48)newline();if(y-height<74)next();let f=form.getFieldMaybe(key);if(!f){f=form.createTextField(key);if(rows>1)f.enableMultiline();f.setText(value)}f.addToPage(page,{x,y:y-height+13,width,height,borderWidth:0,textColor:ink,font,backgroundColor:rgb(1,1,1)});f.setFontSize(10);page.drawLine({start:{x,y:y-height+13},end:{x:x+width,y:y-height+13},thickness:.5,color:line});x+=width+3;if(rows>1){y-=height-20}}
  next();draw(snap.title,48,y,12,bold);y-=28;
  for(const paragraph of snap.body.split(/\n\s*\n/)){let pos=0;for(const match of paragraph.matchAll(/{{([a-z_]+)}}/g)){plain(paragraph.slice(pos,match.index));blank(match[1]);pos=match.index+match[0].length}plain(paragraph.slice(pos));newline();y-=12;if(y<74)next()}
  if(y<250)next();else{newline();y-=8}draw('SIGNATURES',48,y,11,bold);y-=25;draw('Staff signature',48,y,9,font,muted);y-=64;if(snap.signature){const image=await doc.embedPng(snap.signature),size=image.scaleToFit(220,55);page.drawImage(image,{x:48,y:y+3,width:size.width,height:size.height})}draw(snap.signer_name,48,y-10,10,bold);draw('Confirmed '+String(snap.confirmed_at||'').slice(0,10),330,y-10,9);y-=47;draw('Customer signature / name',48,y,9,font,muted);y-=25;const f=form.createTextField('customer_signature');f.setText('');f.addToPage(page,{x:48,y,width:499,height:25,borderWidth:0,font});f.setFontSize(10);page.drawLine({start:{x:48,y},end:{x:547,y},thickness:.5,color:line});
  for(const [i,p] of doc.getPages().entries()){p.drawLine({start:{x:48,y:48},end:{x:547,y:48},thickness:.5,color:line});p.drawText(clean('Reference '+sale.id+' | Template v'+snap.version),{x:48,y:33,size:7,font,color:muted});p.drawText((i+1)+' / '+doc.getPageCount(),{x:512,y:33,size:8,font,color:muted})}
  form.updateFieldAppearances(font);doc.setTitle(sale.service+' contract - '+sale.customer_name);doc.setAuthor('Esquiliano Consulting & Bookkeeping');return doc.save();
 }
 root.PortfolioContractDocumentPDF={build};if(typeof module==='object')module.exports={build};
})(typeof window==='object'?window:globalThis);
