using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace TerasGroup.VRChatMai
{
    /// <summary>
    /// Serialized URL registry for MaiSongs catalog v2.
    /// Populate this component in the Unity Editor before uploading the World.
    /// Runtime code must only select values from these arrays.
    /// </summary>
    public class VmcRuntimeUrlRegistry : UdonSharpBehaviour
    {
        [HideInInspector] public VRCUrl catalogUrl;

        [HideInInspector] public VRCUrl[] audioUrls;
        [HideInInspector] public VRCUrl[] backgroundVideoUrls;
        [HideInInspector] public VRCUrl[] backgroundImageUrls;
        [HideInInspector] public VRCUrl[] jacketUrls;
        [HideInInspector] public VRCUrl[] chartUrls;

        [HideInInspector] public int slotCount;
        [HideInInspector] public int audioVariantCount;
        [HideInInspector] public int backgroundVideoVariantCount;
        [HideInInspector] public int backgroundImageVariantCount;
        [HideInInspector] public int jacketVariantCount;
        [HideInInspector] public int chartDifficultyCount;

        public int AudioIndex(int runtimeSlot, int variant)
        {
            return runtimeSlot * audioVariantCount + variant;
        }

        public int BackgroundVideoIndex(int runtimeSlot, int variant)
        {
            return runtimeSlot * backgroundVideoVariantCount + variant;
        }

        public int BackgroundImageIndex(int runtimeSlot, int variant)
        {
            return runtimeSlot * backgroundImageVariantCount + variant;
        }

        public int JacketIndex(int runtimeSlot, int variant)
        {
            return runtimeSlot * jacketVariantCount + variant;
        }

        public int ChartIndex(int runtimeSlot, int difficulty)
        {
            return runtimeSlot * chartDifficultyCount + (difficulty - 1);
        }
    }
}
