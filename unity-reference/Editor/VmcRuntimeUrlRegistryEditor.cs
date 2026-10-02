#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using VRC.SDKBase;

namespace TerasGroup.VRChatMai.Editor
{
    [CustomEditor(typeof(VmcRuntimeUrlRegistry))]
    public class VmcRuntimeUrlRegistryEditor : UnityEditor.Editor
    {
        [Serializable]
        private class RegistryManifest
        {
            public string catalogUrl;
            public int slotCount;
            public int slotPadWidth;
            public RegistryArrays arrays;
        }

        [Serializable]
        private class RegistryArrays
        {
            public VariantArray audio;
            public VariantArray backgroundVideo;
            public VariantArray backgroundImage;
            public VariantArray jacket;
            public ChartArray chart;
        }

        [Serializable]
        private class VariantArray
        {
            public int variantCount;
            public string[] extensions;
            public string urlTemplate;
        }

        [Serializable]
        private class ChartArray
        {
            public int difficultyCount;
            public int[] difficulties;
            public string urlTemplate;
        }

        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();

            EditorGUILayout.Space();
            EditorGUILayout.HelpBox(
                "Import runtime-url-registry.json before uploading the World. " +
                "All VRCUrl instances are created here in the Unity Editor, never by Udon at runtime.",
                MessageType.Info
            );

            if (GUILayout.Button("Import MaiSongs runtime-url-registry.json"))
            {
                ImportRegistry();
            }
        }

        private void ImportRegistry()
        {
            string file = EditorUtility.OpenFilePanel(
                "Select MaiSongs runtime-url-registry.json",
                "",
                "json"
            );
            if (string.IsNullOrEmpty(file))
            {
                return;
            }

            RegistryManifest manifest;
            try
            {
                manifest = JsonUtility.FromJson<RegistryManifest>(File.ReadAllText(file));
            }
            catch (Exception ex)
            {
                Debug.LogError("Failed to read MaiSongs URL registry: " + ex.Message);
                return;
            }

            if (manifest == null || manifest.arrays == null || manifest.slotCount <= 0)
            {
                Debug.LogError("Invalid MaiSongs runtime URL registry.");
                return;
            }

            var registry = (VmcRuntimeUrlRegistry)target;

            Undo.RecordObject(registry, "Import MaiSongs VRCUrl Registry");

            registry.catalogUrl = new VRCUrl(manifest.catalogUrl);
            registry.slotCount = manifest.slotCount;

            registry.audioVariantCount = manifest.arrays.audio.variantCount;
            registry.backgroundVideoVariantCount = manifest.arrays.backgroundVideo.variantCount;
            registry.backgroundImageVariantCount = manifest.arrays.backgroundImage.variantCount;
            registry.jacketVariantCount = manifest.arrays.jacket.variantCount;
            registry.chartDifficultyCount = manifest.arrays.chart.difficultyCount;

            registry.audioUrls = BuildVariantUrls(
                manifest.slotCount,
                manifest.slotPadWidth,
                manifest.arrays.audio
            );
            registry.backgroundVideoUrls = BuildVariantUrls(
                manifest.slotCount,
                manifest.slotPadWidth,
                manifest.arrays.backgroundVideo
            );
            registry.backgroundImageUrls = BuildVariantUrls(
                manifest.slotCount,
                manifest.slotPadWidth,
                manifest.arrays.backgroundImage
            );
            registry.jacketUrls = BuildVariantUrls(
                manifest.slotCount,
                manifest.slotPadWidth,
                manifest.arrays.jacket
            );
            registry.chartUrls = BuildChartUrls(
                manifest.slotCount,
                manifest.slotPadWidth,
                manifest.arrays.chart
            );

            EditorUtility.SetDirty(registry);
            PrefabUtility.RecordPrefabInstancePropertyModifications(registry);

            Debug.Log(
                "MaiSongs VRCUrl registry imported. " +
                "slots=" + registry.slotCount +
                " audio=" + registry.audioUrls.Length +
                " bgVideo=" + registry.backgroundVideoUrls.Length +
                " bgImage=" + registry.backgroundImageUrls.Length +
                " jacket=" + registry.jacketUrls.Length +
                " charts=" + registry.chartUrls.Length
            );
        }

        private static VRCUrl[] BuildVariantUrls(
            int slotCount,
            int padWidth,
            VariantArray definition
        )
        {
            int variantCount = definition.extensions.Length;
            var result = new VRCUrl[slotCount * variantCount];

            for (int slot = 0; slot < slotCount; slot++)
            {
                string slotText = slot.ToString().PadLeft(padWidth, '0');
                for (int variant = 0; variant < variantCount; variant++)
                {
                    string url = definition.urlTemplate
                        .Replace("{slot}", slotText)
                        .Replace("{ext}", definition.extensions[variant]);
                    result[slot * variantCount + variant] = new VRCUrl(url);
                }
            }

            return result;
        }

        private static VRCUrl[] BuildChartUrls(
            int slotCount,
            int padWidth,
            ChartArray definition
        )
        {
            int count = definition.difficulties.Length;
            var result = new VRCUrl[slotCount * count];

            for (int slot = 0; slot < slotCount; slot++)
            {
                string slotText = slot.ToString().PadLeft(padWidth, '0');
                for (int i = 0; i < count; i++)
                {
                    int difficulty = definition.difficulties[i];
                    string url = definition.urlTemplate
                        .Replace("{slot}", slotText)
                        .Replace("{difficulty}", difficulty.ToString());
                    result[slot * count + i] = new VRCUrl(url);
                }
            }

            return result;
        }
    }
}
#endif
