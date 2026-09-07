
uniform mat4 viewProjection;
uniform mat4 view;
#ifdef DIFFUSE
uniform mat4 diffuseMatrix;
uniform vec2 vDiffuseInfos;
#endif
#ifdef AO
uniform mat4 aoMatrix;
uniform vec2 vAoInfos;
#endif
#ifdef REFLECTIVITYROUGHNESS
uniform mat4 reflectivityRoughnessMatrix;
uniform vec2 vReflectivityRoughnessInfos;
#endif
#ifdef USELODFALLOFF
uniform vec4 vLodFallOff;
#endif
#ifdef POINTSIZE
uniform float pointSize;
#endif
