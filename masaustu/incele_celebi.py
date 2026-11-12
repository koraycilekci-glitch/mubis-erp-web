# -*- coding: utf-8 -*-
import os
kok = r"G:\Drive'ım\EDEFTER"
for d in sorted(os.listdir(kok)):
    if 'ELEB' in d.upper():
        yol = os.path.join(kok, d)
        icerik = os.listdir(yol)
        print(repr(d), '->', icerik[:5])
