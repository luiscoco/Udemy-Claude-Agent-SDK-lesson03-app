"""Trusted host regression checks; lives outside the agent working directory."""
import contextlib,importlib.util,io,json,sys

cases=[]
with contextlib.redirect_stdout(io.StringIO()):
 try:
  spec=importlib.util.spec_from_file_location('student_utils',sys.argv[1])
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  tests=[('Average: ordinary list','calculate_average',[2,4,6],4),
         ('Average: empty list','calculate_average',[],0),
         ('Name: ordinary user','get_user_name',{'name':'Ada'},'ADA'),
         ('Name: missing user','get_user_name',None,'')]
  for label,name,arg,expected in tests:
   try:
    actual=getattr(module,name)(arg)
    cases.append(dict(label=label,expected=expected,actual=actual,passed=actual==expected))
   except Exception as error:
    cases.append(dict(label=label,expected=expected,error=type(error).__name__,passed=False))
 except Exception as error:
  cases=[dict(label='Import repaired utils.py',expected='valid Python module',error=type(error).__name__,passed=False)]
print(json.dumps(dict(available=True,passed=sum(c['passed'] for c in cases),total=4,cases=cases),default=str))
