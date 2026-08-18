import os
base = r'C:\Users\hp\PROJELER\mubis-erp-web\mubis-automation'
folders = ['api', 'worker', 'worker\browsers', 'shared', 'scheduler']
for f in folders:
    os.makedirs(os.path.join(base, f), exist_ok=True)
print('created')
