from pathlib import Path
from pypdf import PdfReader
root=Path(__file__).resolve().parents[1]/'tmp'/'pdfs'
for filename in ('Marketing.pdf','Accounting.pdf','Government-Documents.pdf','HR.pdf','Business-Intelligence.pdf','IT.pdf','long-contract.pdf'):
    reader=PdfReader(root/filename)
    fields=reader.get_fields()
    assert fields and fields['customer_name']['/V']=='Sample Customer'
    assert fields['contract_date']['/V']=='2026-11-18'
    widgets=0
    for page in reader.pages:
        for ref in page.get('/Annots',[]):
            obj=ref.get_object()
            if obj.get('/Subtype')!='/Widget': continue
            widgets+=1
            parent=obj.get('/Parent')
            field=parent.get_object() if parent else obj
            name=field.get('/T')
            assert name in fields, name
            assert field.get('/V','')==fields[name].get('/V',''), name
            assert obj.get('/AP') and obj['/AP'].get('/N'), name
            x0,y0,x1,y1=map(float,obj['/Rect'])
            assert x0>=40 and x1<=555 and y0>=60 and y1<=760,(filename,name,obj['/Rect'])
    assert widgets==len(fields),(filename,widgets,len(fields))
print('Independent PDF verification passed: canonical values, widget values/appearances, and page bounds for all six services and long content.')
